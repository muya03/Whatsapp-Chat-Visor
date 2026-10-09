/** Utilidades de texto compartidas por parser, búsqueda y resaltado. */

/**
 * Caracteres invisibles de formato que WhatsApp (sobre todo iOS) intercala en las exportaciones.
 * Se eliminan solo para RECONOCER cabeceras; ver README (limitaciones) sobre el texto.
 *  U+200B ancho cero · U+200E/F LRM/RLM · U+202A–202E incrustaciones · U+2066–2069 aislantes
 *  U+061C marca árabe · U+FEFF BOM. (U+200D, el unificador de emojis, NO se toca.)
 */
const INVISIBLE_RE = /[​‎‏‪-‮⁦-⁩؜﻿]/g;

export function stripInvisible(value: string): string {
  return value.replace(INVISIBLE_RE, '');
}

// Ceros de bloques de dígitos decimales localizados (diez code points consecutivos cada uno).
const DIGIT_ZEROS = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0e50, 0x1040];
const DIGIT_RE = new RegExp(
  `[${DIGIT_ZEROS.map((z) => `${String.fromCodePoint(z)}-${String.fromCodePoint(z + 9)}`).join('')}]`,
  'g',
);

/**
 * Convierte dígitos árabes/persas/devanagari/tailandeses... a ASCII.
 * Cada dígito ocupa un solo code unit, así que la longitud se conserva y los
 * desplazamientos hallados sobre el resultado sirven sobre el original.
 */
export function normalizeDigits(value: string): string {
  return value.replace(DIGIT_RE, (d) => {
    const code = d.charCodeAt(0);
    for (const zero of DIGIT_ZEROS) if (code >= zero && code <= zero + 9) return String(code - zero);
    return d;
  });
}

const MARKS_RE = /\p{M}/u;

/**
 * Plegado de un carácter para búsqueda/resaltado insensible a mayúsculas y tildes.
 * Mantiene SIEMPRE una unidad de salida por unidad de entrada, de modo que los índices
 * de coincidencia sobre el texto plegado valen sobre el texto original.
 */
export function foldChar(ch: string): string {
  if (ch.length !== 1) return ch;
  const code = ch.charCodeAt(0);
  if (code < 128) return code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : ch;
  const base = ch.normalize('NFD');
  const first = base.charAt(0);
  const stripped = base.length > 1 && MARKS_RE.test(base.charAt(1)) ? first : ch;
  const lower = stripped.toLowerCase();
  return lower.length === 1 ? lower : stripped;
}

/**
 * Plegado de una cadena completa para el índice de búsqueda (rápido y nativo; no conserva longitud).
 * Para resaltar coincidencias en pantalla se usa `foldChar`, que sí conserva posiciones.
 */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
}

/** Nombre base de una ruta (soporta separadores / y \). */
export function baseName(path: string): string {
  const clean = path.replace(/\\/g, '/');
  const idx = clean.lastIndexOf('/');
  return idx === -1 ? clean : clean.slice(idx + 1);
}

/**
 * Clave canónica para emparejar el nombre de un adjunto citado en el chat con una entrada
 * del ZIP: NFC, sin invisibles, sin ruta, en minúsculas.
 */
export function attachmentKey(name: string): string {
  return baseName(stripInvisible(name.normalize('NFC')).trim()).toLowerCase();
}

/** Clave laxa (segunda oportunidad): sin tildes, espacios, guiones ni guiones bajos. */
export function looseAttachmentKey(name: string): string {
  return attachmentKey(name)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\s_\-.]+/g, '');
}
