import { normalizeDigits } from './text';
import type { DateOrder } from './types';

/**
 * Reconocimiento de la cabecera temporal de una línea de exportación.
 *
 * Se hace por etapas (fecha → hora → marcador AM/PM → separador) en lugar de con una única
 * expresión regular gigante, de modo que cada rareza regional vive en un único sitio.
 * Se aceptan estas formas (ejemplos reales de exportaciones):
 *   Android  14/12/22, 12:55 - Ana: hola          12/14/22, 12:55 PM - Ana: hi
 *   iOS      [14/12/22, 12:55:37] Ana: hola       [12/14/22, 12:55:37 PM] Ana: hi
 *   ISO-ish  2022-12-14, 12:55 - Ana: hola        2022/12/14 12:55 - …
 *   Coreano  2022. 12. 14. 오후 12:55, Ana : hola   (mejor esfuerzo)
 *
 * IMPORTANTE: una línea de continuación que casualmente empiece por una fecha NO debe tomarse
 * como cabecera. Por eso se exige el cierre: «]» (iOS) o « - » (Android); la coma solo se admite
 * tras un marcador de periodo prefijado (coreano/chino).
 */

const DATE = String.raw`\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}|\d{1,4}\.\s\d{1,2}\.\s\d{1,4}\.?`;

const PREFIX_PERIODS: Record<string, 'am' | 'pm'> = {
  오전: 'am',
  오후: 'pm',
  上午: 'am',
  下午: 'pm',
  凌晨: 'am',
  清晨: 'am',
  早上: 'am',
  中午: 'pm',
  晚上: 'pm',
};
const SUFFIX_PERIODS: Record<string, 'am' | 'pm'> = {
  ص: 'am',
  م: 'pm',
  'π.μ.': 'am',
  'μ.μ.': 'pm',
  PG: 'am',
  PTG: 'pm',
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PREFIX_PERIOD_PATTERN = Object.keys(PREFIX_PERIODS).map(esc).join('|');
// [APap]\.? ?[Mm]\.? cubre AM, a.m., a. m., p. m., etc.
const SUFFIX_PERIOD_PATTERN = [String.raw`[APap]\.?\s?[Mm]\.?`, ...Object.keys(SUFFIX_PERIODS).map(esc)].join('|');

const HEAD_RE = new RegExp(`^(\\[)?(${DATE})(?:[,\\u060C]\\s*|\\s+)`, 'u');
const TIME_RE = new RegExp(
  `^(?:(${PREFIX_PERIOD_PATTERN})\\s?)?(\\d{1,2})[:.](\\d{2})(?::(\\d{2}))?(?:\\s?(${SUFFIX_PERIOD_PATTERN})(?![\\p{L}\\p{N}]))?`,
  'u',
);
const BRACKET_TAIL_RE = /^\s*\]\s?/;
const DASH_TAIL_RE = /^\s[-–—]\s?/;
const COMMA_TAIL_RE = /^,\s?/;

/** Forma tosca solo para diagnóstico: ¿empieza la línea como una marca de tiempo que no hemos podido leer? */
const TIMESTAMP_LIKE_RE = new RegExp(`^\\[(?:${DATE})[\\],\\s]|^(?:${DATE})[,\\s].{0,20}\\d{1,2}[:.]\\d{2}`, 'u');

export function looksLikeTimestampLine(strippedLine: string): boolean {
  const c0 = strippedLine.charCodeAt(0);
  if (c0 !== 91 && !(c0 >= 48 && c0 <= 57) && c0 < 0x0660) return false;
  return TIMESTAMP_LIKE_RE.test(normalizeDigits(strippedLine));
}

export interface HeaderMatch {
  /** Partes numéricas de la fecha en el orden en que aparecen (a/b/c). */
  parts: [number, number, number];
  /** Longitud en caracteres de cada parte (para distinguir año de 4 cifras). */
  partLengths: [number, number, number];
  hour: number;
  minute: number;
  second: number;
  period: 'am' | 'pm' | '';
  rawTime: string;
  bracketed: boolean;
  /** Índice del primer carácter tras el separador de cabecera. */
  restStart: number;
}

/**
 * Intenta reconocer la cabecera al inicio de `line`. `line` debe venir sin caracteres invisibles.
 * Devuelve null si la línea es una continuación.
 */
export function matchHeader(line: string): HeaderMatch | null {
  // Descarte rápido: toda cabecera empieza por «[» o por un dígito (tras normalizar).
  const c0 = line.charCodeAt(0);
  if (c0 !== 91 && !(c0 >= 48 && c0 <= 57) && c0 < 0x0660) return null;

  const ascii = normalizeDigits(line);
  const head = ascii.match(HEAD_RE);
  if (!head) return null;
  const rest = ascii.slice(head[0].length);
  const t = rest.match(TIME_RE);
  if (!t) return null;

  const bracketed = head[1] === '[';
  const afterTime = rest.slice(t[0].length);
  const hasPrefixPeriod = Boolean(t[1]);
  let tail: RegExpMatchArray | null;
  if (bracketed) tail = afterTime.match(BRACKET_TAIL_RE);
  else tail = afterTime.match(DASH_TAIL_RE) ?? (hasPrefixPeriod ? afterTime.match(COMMA_TAIL_RE) : null);
  if (!tail) return null;

  const dateText = head[2] ?? '';
  const pieces = dateText.split(/[/.\-]/).map((p) => p.trim()).filter((p) => p.length > 0);
  if (pieces.length < 3) return null;
  const [a = '', b = '', c = ''] = pieces;

  let period: 'am' | 'pm' | '' = '';
  if (t[1]) period = PREFIX_PERIODS[t[1]] ?? '';
  else if (t[5]) {
    const raw = t[5];
    period = SUFFIX_PERIODS[raw] ?? (/^[Aa]/.test(raw) ? 'am' : 'pm');
  }

  const restStart = head[0].length + t[0].length + tail[0].length;
  const rawTime = line.slice(bracketed ? 1 : 0, head[0].length + t[0].length).replace(/\s+$/, '');
  return {
    parts: [parseInt(a, 10), parseInt(b, 10), parseInt(c, 10)],
    partLengths: [a.length, b.length, c.length],
    hour: parseInt(t[2] ?? '0', 10),
    minute: parseInt(t[3] ?? '0', 10),
    second: t[4] ? parseInt(t[4], 10) : 0,
    period,
    rawTime,
    bracketed,
    restStart,
  };
}

// ---------------------------------------------------------------------------------------
// Resolución de fechas
// ---------------------------------------------------------------------------------------

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function normalizeYear(raw: number, len: number): number {
  if (len >= 4) {
    // Era budista (Tailandia): 2552 BE = 2009. WhatsApp no existía antes de 2009.
    if (raw >= 2500 && raw <= 2599) return raw - 543;
    return raw;
  }
  return raw >= 70 ? 1900 + raw : 2000 + raw;
}

export interface ResolvedDate {
  year: number;
  month: number;
  day: number;
}

/** Interpreta (a,b,c) con un orden concreto. Devuelve null si no es una fecha de calendario válida. */
export function resolveDate(
  parts: [number, number, number],
  lens: [number, number, number],
  order: DateOrder,
): ResolvedDate | null {
  let y: number, m: number, d: number, yl: number;
  const [a, b, c] = parts;
  if (order === 'YMD') [y, m, d, yl] = [a, b, c, lens[0]];
  else if (order === 'MDY') [y, m, d, yl] = [c, a, b, lens[2]];
  else [y, m, d, yl] = [c, b, a, lens[2]];
  // Años persas (1300–1499): sin conversor de calendario → se declara no válido y se avisa.
  if (yl >= 4 && y >= 1300 && y <= 1499) return null;
  y = normalizeYear(y, yl);
  if (m < 1 || m > 12 || d < 1 || y < 1970 || y > 2200) return null;
  if (d > daysInMonth(y, m)) return null;
  return { year: y, month: m, day: d };
}

export function toWallClock(date: ResolvedDate, h: number, mi: number, s: number, period: 'am' | 'pm' | ''): number | null {
  let hour = h;
  if (period === 'pm' && hour < 12) hour += 12;
  else if (period === 'am' && hour === 12) hour = 0;
  if (hour > 23 || mi > 59 || s > 59) return null;
  return Date.UTC(date.year, date.month - 1, date.day, hour, mi, s);
}

export function dayKeyOf(date: ResolvedDate): number {
  return date.year * 10000 + date.month * 100 + date.day;
}
