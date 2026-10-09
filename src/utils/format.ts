import { es } from '../i18n/es';

export type TimeFormat = 'auto' | '12' | '24';

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

/** Hora de pared (ts codificado como UTC) → «HH:mm» o «h:mm a. m.». Sin conversión de zona. */
export function formatTime(ts: number | null, rawFallback: string, pref: TimeFormat, sourceHour12: boolean): string {
  if (ts === null) return rawFallback;
  const d = new Date(ts);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const use12 = pref === '12' || (pref === 'auto' && sourceHour12);
  if (!use12) return `${pad(h)}:${pad(m)}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

const dateFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const dateShortFmt = new Intl.DateTimeFormat('es', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const weekdayFmt = new Intl.DateTimeFormat('es', { weekday: 'long', timeZone: 'UTC' });

export const dayKeyToTs = (k: number) => Date.UTC(Math.floor(k / 10000), Math.floor((k % 10000) / 100) - 1, k % 100);

export function todayKey(now = new Date()): number {
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

/** Etiqueta del separador de día: «Hoy», «Ayer», día de la semana (última semana) o fecha completa. */
export function formatDayLabel(dayKey: number, now = new Date()): string {
  const today = todayKey(now);
  if (dayKey === today) return es.today;
  const t = dayKeyToTs(dayKey);
  const diff = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - t) / 86_400_000);
  if (diff === 1) return es.yesterday;
  if (diff > 1 && diff < 7) return capitalize(weekdayFmt.format(t));
  return dateFmt.format(t);
}

export const formatDateLong = (dayKey: number) => dateFmt.format(dayKeyToTs(dayKey));
export const formatDateShort = (dayKey: number) => dateShortFmt.format(dayKeyToTs(dayKey));
export const formatMonth = (year: number, month0: number) => capitalize(monthFmt.format(Date.UTC(year, month0, 1)));
export const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1).replace('.', ',')} ${units[i]}`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Color estable por nombre para los remitentes de grupo (paleta de WhatsApp, por tema vía CSS). */
export function senderColorIndex(name: string, paletteSize = 12): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % paletteSize;
}

export function initials(name: string): string {
  const parts = name.replace(/[~+]/g, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = Array.from(parts[0]!)[0] ?? '?';
  const second = parts.length > 1 ? (Array.from(parts[parts.length - 1]!)[0] ?? '') : '';
  return (first + second).toUpperCase();
}
