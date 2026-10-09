import { foldChar } from '../../parser/whatsapp/text';

/** Plegado carácter a carácter (conserva índices) para poder resaltar sobre el texto original. */
export function foldKeepLength(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) out += foldChar(text.charAt(i));
  return out;
}

export interface Segment {
  text: string;
  hit: boolean;
}

/** Divide `text` en tramos, marcando las coincidencias (insensible a mayúsculas y tildes) con `foldedQuery`. */
export function splitByQuery(text: string, foldedQuery: string): Segment[] {
  if (!foldedQuery) return [{ text, hit: false }];
  const folded = foldKeepLength(text);
  const out: Segment[] = [];
  let from = 0;
  for (;;) {
    const idx = folded.indexOf(foldedQuery, from);
    if (idx === -1) break;
    if (idx > from) out.push({ text: text.slice(from, idx), hit: false });
    out.push({ text: text.slice(idx, idx + foldedQuery.length), hit: true });
    from = idx + foldedQuery.length;
  }
  if (from === 0) return [{ text, hit: false }];
  if (from < text.length) out.push({ text: text.slice(from), hit: false });
  return out;
}

/** Fragmento centrado en la primera coincidencia, para las listas de resultados. */
export function snippetAround(text: string, foldedQuery: string, radius = 40): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= radius * 2) return flat;
  const idx = foldKeepLength(flat).indexOf(foldedQuery);
  if (idx === -1) return flat.slice(0, radius * 2) + '…';
  const start = Math.max(0, idx - radius);
  const end = Math.min(flat.length, idx + foldedQuery.length + radius);
  return (start > 0 ? '…' : '') + flat.slice(start, end) + (end < flat.length ? '…' : '');
}
