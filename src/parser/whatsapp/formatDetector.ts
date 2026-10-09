import { daysInMonth } from './dateParser';
import type { DateOrder, DateOrderSetting } from './types';

/**
 * Inferencia del orden día/mes/año a partir de TODAS las fechas del archivo.
 *
 * 1. Si la primera parte tiene 4 cifras → AAAA-MM-DD.
 * 2. Si algún valor de la primera posición supera 12 solo puede ser día (DMY); si lo hace el
 *    de la segunda, solo MDY. Una exportación coherente no mezcla ambas cosas.
 * 3. Si todos los valores caben en ambos órdenes, se comparan las violaciones de cronología
 *    (un chat exportado está en orden temporal) y, si tampoco decide, se asume que el campo que
 *    cambia más despacio es el mes. En ese caso la elección es una apuesta → `ambiguous: true`
 *    para que la interfaz ofrezca corregirla sin volver a abrir el archivo.
 */

export interface DateSample {
  a: number;
  b: number;
  c: number;
  firstLen: number;
  lastLen: number;
}

export interface DateOrderDecision {
  order: DateOrder;
  ambiguous: boolean;
  /** true si las fechas no son válidas con ningún orden para una parte significativa. */
  inconsistent: boolean;
}

function validAs(s: DateSample, order: DateOrder): boolean {
  let y: number, m: number, d: number;
  if (order === 'YMD') [y, m, d] = [s.a, s.b, s.c];
  else if (order === 'MDY') [y, m, d] = [s.c, s.a, s.b];
  else [y, m, d] = [s.c, s.b, s.a];
  const yl = order === 'YMD' ? s.firstLen : s.lastLen;
  if (m < 1 || m > 12 || d < 1) return false;
  let year = y;
  if (yl < 4) year = y >= 70 ? 1900 + y : 2000 + y;
  else if (y >= 2500 && y <= 2599) year = y - 543;
  return d <= daysInMonth(year, m);
}

function dayNumber(s: DateSample, order: DateOrder): number | null {
  if (!validAs(s, order)) return null;
  let y: number, m: number, d: number;
  if (order === 'YMD') [y, m, d] = [s.a, s.b, s.c];
  else if (order === 'MDY') [y, m, d] = [s.c, s.a, s.b];
  else [y, m, d] = [s.c, s.b, s.a];
  const yl = order === 'YMD' ? s.firstLen : s.lastLen;
  if (yl < 4) y = y >= 70 ? 1900 + y : 2000 + y;
  return y * 372 + (m - 1) * 31 + (d - 1);
}

export function decideDateOrder(samples: DateSample[], setting: DateOrderSetting = 'auto'): DateOrderDecision {
  if (setting !== 'auto') return { order: setting, ambiguous: false, inconsistent: false };
  if (samples.length === 0) return { order: 'DMY', ambiguous: false, inconsistent: false };

  // Con AAAA primero no hay duda razonable.
  const yearFirst = samples.filter((s) => s.firstLen === 4).length;
  if (yearFirst > samples.length / 2) return { order: 'YMD', ambiguous: false, inconsistent: false };

  const total = samples.length;
  let dmy = 0;
  let mdy = 0;
  for (const s of samples) {
    if (validAs(s, 'DMY')) dmy++;
    if (validAs(s, 'MDY')) mdy++;
  }

  if (dmy === total && mdy < total) return { order: 'DMY', ambiguous: false, inconsistent: false };
  if (mdy === total && dmy < total) return { order: 'MDY', ambiguous: false, inconsistent: false };
  if (dmy < total && mdy < total) {
    // Mezcla incoherente: se elige el que valide más y se avisa.
    return { order: dmy >= mdy ? 'DMY' : 'MDY', ambiguous: false, inconsistent: true };
  }

  // Ambos órdenes validan todo el archivo: desempate por cronología.
  const violations = (order: DateOrder): number => {
    let prev = -Infinity;
    let bad = 0;
    for (const s of samples) {
      const n = dayNumber(s, order);
      if (n === null) continue;
      if (n < prev) bad++;
      prev = Math.max(prev, n);
    }
    return bad;
  };
  const vDmy = violations('DMY');
  const vMdy = violations('MDY');
  const margin = Math.max(2, Math.ceil(total * 0.002));
  if (vMdy - vDmy >= margin) return { order: 'DMY', ambiguous: false, inconsistent: false };
  if (vDmy - vMdy >= margin) return { order: 'MDY', ambiguous: false, inconsistent: false };

  // Sin pistas cronológicas: el mes cambia más despacio que el día.
  const distinctA = new Set(samples.map((s) => s.a)).size;
  const distinctB = new Set(samples.map((s) => s.b)).size;
  let order: DateOrder = 'DMY';
  if (distinctA < distinctB) order = 'MDY';
  return { order, ambiguous: true, inconsistent: false };
}

/** Plataforma de origen: iOS entrecomilla la fecha con corchetes. */
export function detectPlatform(bracketed: number, plain: number): 'ios' | 'android' | 'unknown' {
  if (bracketed === 0 && plain === 0) return 'unknown';
  return bracketed > plain ? 'ios' : 'android';
}
