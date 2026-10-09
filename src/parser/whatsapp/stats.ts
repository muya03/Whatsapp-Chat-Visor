import type { ChatMessage, ChatStats, MediaKind } from './types';

const STOPWORDS = new Set(
  (
    'that this with from have para pero como esta este esto está estoy tengo aquí ahora bien también porque cuando donde entre sobre desde hasta todo todos todas todos muy mas más sus les los las una uno unos unas ' +
    'with what when your they them then than there were been being will would could should about into just like only some more very over also from does dont cant have has had not you for and the are was but'
  ).split(' '),
);

const segmenter: { segment(s: string): Iterable<{ segment: string }> } | null =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new (Intl as unknown as { Segmenter: new (l?: string, o?: object) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter(undefined, { granularity: 'grapheme' })
    : null;
const PICTO_RE = /\p{Extended_Pictographic}/u;
const WORD_RE = /[\p{L}][\p{L}\p{M}'’-]{3,}/gu;

export function extractEmojis(text: string): string[] {
  if (!PICTO_RE.test(text)) return [];
  const out: string[] = [];
  if (segmenter) {
    for (const { segment } of segmenter.segment(text)) if (PICTO_RE.test(segment)) out.push(segment);
  } else {
    for (const m of text.matchAll(/\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu)) out.push(m[0]);
  }
  return out;
}

const top = <K extends string>(map: Map<string, number>, limit: number, key: K) =>
  [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([k, count]) => ({ [key]: k, count }) as Record<K, string> & { count: number });

/** Estadísticas calculadas exclusivamente a partir de los mensajes analizados. */
export function computeStats(messages: ChatMessage[]): ChatStats {
  const perParticipant = new Map<string, number>();
  const perHour = new Array<number>(24).fill(0);
  const perMonth = new Map<number, number>();
  const media: Partial<Record<MediaKind, number>> = {};
  const emojis = new Map<string, number>();
  const words = new Map<string, number>();
  let attachmentsTotal = 0;
  let systemCount = 0;
  let firstDay: number | null = null;
  let lastDay: number | null = null;

  for (const m of messages) {
    if (m.kind === 'system') {
      systemCount++;
      continue;
    }
    if (m.sender) perParticipant.set(m.sender, (perParticipant.get(m.sender) ?? 0) + 1);
    if (m.dayKey !== null) {
      if (firstDay === null || m.dayKey < firstDay) firstDay = m.dayKey;
      if (lastDay === null || m.dayKey > lastDay) lastDay = m.dayKey;
      const ym = Math.floor(m.dayKey / 100);
      perMonth.set(ym, (perMonth.get(ym) ?? 0) + 1);
    }
    if (m.ts !== null) {
      const h = new Date(m.ts).getUTCHours();
      perHour[h] = (perHour[h] ?? 0) + 1;
    }
    for (const a of m.attachments) {
      if (a.omitted) continue;
      attachmentsTotal++;
      media[a.kind] = (media[a.kind] ?? 0) + 1;
    }
    if (m.text) {
      for (const e of extractEmojis(m.text)) emojis.set(e, (emojis.get(e) ?? 0) + 1);
      if (m.kind === 'text') {
        for (const w of m.text.toLowerCase().matchAll(WORD_RE)) {
          const word = w[0];
          if (word.length < 4 || STOPWORDS.has(word) || /^https?/.test(word)) continue;
          words.set(word, (words.get(word) ?? 0) + 1);
        }
      }
    }
  }

  return {
    perParticipant: top(perParticipant, 50, 'name'),
    perHour,
    perMonth: [...perMonth.entries()].sort((a, b) => a[0] - b[0]),
    media,
    attachmentsTotal,
    topEmojis: top(emojis, 12, 'emoji'),
    topWords: top(words, 15, 'word'),
    firstDay,
    lastDay,
    messageCount: messages.length - systemCount,
    systemCount,
  };
}
