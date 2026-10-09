/**
 * Formato de texto de WhatsApp → árbol de nodos (nunca HTML).
 * Soporta *negrita*, _cursiva_, ~tachado~, `monoespaciado`, ```bloque```, > cita y enlaces http(s).
 * El árbol lo pintan componentes React (escapan por construcción) o el exportador (escapa a mano).
 */

export type RichNode =
  | { t: 'text'; v: string }
  | { t: 'bold' | 'italic' | 'strike'; c: RichNode[] }
  | { t: 'mono'; v: string }
  | { t: 'code'; v: string }
  | { t: 'quote'; c: RichNode[] }
  | { t: 'link'; href: string; v: string };

const MARKERS = new Set(['*', '_', '~', '`']);
const WORD = /[\p{L}\p{N}]/u;
const SPACE = /\s/;
const URL_RE = /^(?:https?:\/\/|www\.)[^\s<>]+/i;

function isWord(ch: string | undefined): boolean {
  return ch !== undefined && WORD.test(ch);
}

function findClose(s: string, open: number, marker: string): number {
  for (let k = open + 2; k < s.length; k++) {
    if (s[k] !== marker) continue;
    const prev = s[k - 1];
    if (prev === undefined || SPACE.test(prev) || prev === marker) continue;
    if (isWord(s[k + 1])) continue;
    return k;
  }
  return -1;
}

function trimUrl(raw: string): string {
  let url = raw;
  // Puntuación final que casi nunca forma parte de la URL.
  for (;;) {
    const last = url[url.length - 1];
    if (last === undefined) break;
    if (/[.,;:!?'"»”]/.test(last)) url = url.slice(0, -1);
    else if (last === ')' && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) url = url.slice(0, -1);
    else break;
  }
  return url;
}

/** Devuelve una URL absoluta http(s) segura o null. Rechaza javascript:, data:, etc. */
export function safeHref(raw: string): string | null {
  const candidate = /^www\./i.test(raw) ? `https://${raw}` : raw;
  try {
    const u = new URL(candidate);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

function parseInline(s: string): RichNode[] {
  const out: RichNode[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
  };
  let i = 0;
  while (i < s.length) {
    const ch = s.charAt(i);
    if (MARKERS.has(ch)) {
      const prev = s[i - 1];
      const next = s[i + 1];
      if (!isWord(prev) && next !== undefined && !SPACE.test(next) && next !== ch) {
        const j = findClose(s, i, ch);
        if (j > i + 1) {
          flush();
          const inner = s.slice(i + 1, j);
          if (ch === '`') out.push({ t: 'mono', v: inner });
          else out.push({ t: ch === '*' ? 'bold' : ch === '_' ? 'italic' : 'strike', c: parseInline(inner) });
          i = j + 1;
          continue;
        }
      }
    } else if ((ch === 'h' || ch === 'H' || ch === 'w' || ch === 'W') && !isWord(s[i - 1])) {
      const m = s.slice(i).match(URL_RE);
      if (m) {
        const text = trimUrl(m[0]);
        const href = safeHref(text);
        if (href) {
          flush();
          out.push({ t: 'link', href, v: text });
          i += text.length;
          continue;
        }
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

function parseLines(text: string): RichNode[] {
  const lines = text.split('\n');
  const out: RichNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (/^>\s?/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? '')) q.push((lines[i] ?? '').replace(/^>\s?/, '')), i++;
      out.push({ t: 'quote', c: parseLines(q.join('\n')) });
      continue;
    }
    if (out.length > 0 && out[out.length - 1]!.t !== 'quote') out.push({ t: 'text', v: '\n' });
    out.push(...parseInline(line));
    i++;
  }
  return out;
}

const cache = new Map<string, RichNode[]>();

/** Convierte texto plano en nodos con formato. Memoizado (los mensajes se vuelven a pintar al hacer scroll). */
export function parseRichText(text: string): RichNode[] {
  const hit = cache.get(text);
  if (hit) return hit;
  const out: RichNode[] = [];
  let last = 0;
  for (const m of text.matchAll(/```([\s\S]+?)```/g)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(...parseLines(text.slice(last, idx)));
    out.push({ t: 'code', v: (m[1] ?? '').replace(/^\n|\n$/g, '') });
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(...parseLines(text.slice(last)));
  if (cache.size > 4000) cache.clear();
  cache.set(text, out);
  return out;
}

const EMOJI_RE = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[‍️⃣]|\p{Emoji_Modifier}|[#*0-9]️?⃣)+$/u;

/** Mensajes compuestos solo por 1–3 emojis se muestran ampliados, como en WhatsApp. */
export function emojiOnlyCount(text: string): number {
  const t = text.replace(/\s+/g, '');
  if (!t || t.length > 40 || !EMOJI_RE.test(t)) return 0;
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => { segment(s: string): Iterable<unknown> } }).Segmenter;
  if (Seg) {
    let n = 0;
    for (const _ of new Seg(undefined, { granularity: 'grapheme' }).segment(t)) {
      void _;
      n++;
    }
    return n;
  }
  return Array.from(t.replace(/[‍️]/g, '')).length;
}
