// Genera chats sintéticos grandes en samples/generated (ignorado por git). Uso: npm run samples:big -- 100000
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateChat } from '../src/tests/helpers/synthetic.ts';
const sizes = process.argv.slice(2).map(Number).filter(Boolean);
if (sizes.length === 0) sizes.push(10_000, 50_000, 100_000);
mkdirSync('samples/generated', { recursive: true });
for (const n of sizes) {
  writeFileSync(`samples/generated/chat-${n}.txt`, generateChat({ messages: n }));
  console.log('✔', `samples/generated/chat-${n}.txt`);
}
