import type { ChatMessage } from '../../parser/whatsapp/types';

/**
 * Modelo de filas de la lista virtualizada. Se calcula una vez por conversación (y al cambiar el orden de fecha);
 * NO depende de quién es "yo" ni del tema, así que cambiar esos ajustes no recalcula nada.
 *
 * Agrupación visual (no puramente estética: nunca mezcla remitentes ni días):
 *  un mensaje continúa el grupo anterior si es del mismo remitente, del mismo día y han pasado
 *  como mucho GROUP_MAX_GAP_MS desde el anterior. Solo el primero del grupo lleva "cola" y nombre.
 */
export const GROUP_MAX_GAP_MS = 10 * 60_000;

export type Row =
  | { t: 'date'; dayKey: number; msg: number }
  | { t: 'sys'; msg: number }
  | { t: 'msg'; msg: number; first: boolean; last: boolean };

export interface RowModel {
  rows: Row[];
  /** id de mensaje → índice de fila. */
  msgToRow: Int32Array;
  /** día (yyyymmdd) → índice de su fila separadora. */
  dayToRow: Map<number, number>;
  /** Días con mensajes, ordenados y sin repetir. */
  days: number[];
}

export function buildRows(messages: ChatMessage[]): RowModel {
  const rows: Row[] = [];
  const msgToRow = new Int32Array(messages.length);
  const dayToRow = new Map<number, number>();
  const daySet = new Set<number>();
  let lastDay: number | null = null;
  let prevMsgRow: Extract<Row, { t: 'msg' }> | null = null;
  let prev: ChatMessage | null = null;

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    if (m.dayKey !== null && m.dayKey !== lastDay) {
      lastDay = m.dayKey;
      daySet.add(m.dayKey);
      dayToRow.set(m.dayKey, rows.length);
      rows.push({ t: 'date', dayKey: m.dayKey, msg: i });
      prevMsgRow = null;
      prev = null;
    }
    if (m.kind === 'system') {
      msgToRow[i] = rows.length;
      rows.push({ t: 'sys', msg: i });
      prevMsgRow = null;
      prev = null;
      continue;
    }
    const continues =
      prev !== null &&
      prevMsgRow !== null &&
      prev.sender === m.sender &&
      (prev.ts === null || m.ts === null || m.ts - prev.ts <= GROUP_MAX_GAP_MS);
    const row: Extract<Row, { t: 'msg' }> = { t: 'msg', msg: i, first: !continues, last: true };
    if (continues && prevMsgRow) prevMsgRow.last = false;
    msgToRow[i] = rows.length;
    rows.push(row);
    prevMsgRow = row;
    prev = m;
  }
  return { rows, msgToRow, dayToRow, days: [...daySet].sort((a, b) => a - b) };
}

/** Primer día con mensajes ≥ `dayKey` (o el último anterior si no hay posteriores). */
export function nearestDay(days: number[], dayKey: number): number | null {
  if (days.length === 0) return null;
  let lo = 0;
  let hi = days.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (days[mid]! < dayKey) lo = mid + 1;
    else hi = mid;
  }
  return days[lo]! >= dayKey ? days[lo]! : days[days.length - 1]!;
}
