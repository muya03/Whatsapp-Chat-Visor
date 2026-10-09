// Mide el analizador con chats sintéticos. Uso: npm run bench:parser
import { performance } from 'node:perf_hooks';
import { parseChat } from '../src/parser/whatsapp/parser.ts';
import { computeStats } from '../src/parser/whatsapp/stats.ts';
import { SearchIndex } from '../src/features/search/searchIndex.ts';
import { generateChat } from '../src/tests/helpers/synthetic.ts';

const sizes = [10_000, 50_000, 100_000, 300_000];
const rows: Record<string, string | number>[] = [];
for (const n of sizes) {
  const text = generateChat({ messages: n, withMedia: true });
  global.gc?.();
  await new Promise((r) => setTimeout(r, 50));
  const mem0 = process.memoryUsage().heapUsed;
  let t = performance.now();
  const chat = parseChat(text);
  const parseMs = performance.now() - t;
  t = performance.now();
  const stats = computeStats(chat.messages);
  const statsMs = performance.now() - t;
  t = performance.now();
  const idx = new SearchIndex(chat.messages);
  const indexMs = performance.now() - t;
  t = performance.now();
  const hits = idx.search('playa');
  const searchMs = performance.now() - t;
  global.gc?.();
  const heapMb = (process.memoryUsage().heapUsed - mem0) / 1048576;
  rows.push({
    mensajes: n,
    'TXT (MB)': +(text.length / 1048576).toFixed(1),
    'parse (ms)': Math.round(parseMs),
    'stats (ms)': Math.round(statsMs),
    'índice (ms)': Math.round(indexMs),
    'búsqueda (ms)': +searchMs.toFixed(1),
    resultados: hits.length,
    'heap retenido (MB)': Math.round(heapMb),
    'msgs parseados': chat.messages.length,
    'stats ok': stats.messageCount > 0 ? 'sí' : 'no',
  });
}
console.table(rows);
