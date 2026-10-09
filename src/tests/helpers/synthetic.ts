/**
 * Generador determinista de chats sintéticos (sin datos reales) para pruebas y mediciones.
 * Mezcla mensajes cortos, multilínea, emojis, adjuntos y avisos, repartidos en varios años.
 */
export interface SyntheticOptions {
  messages: number;
  participants?: string[];
  style?: 'android' | 'ios';
  withMedia?: boolean;
  seed?: number;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const WORDS = 'hola buenas quedamos mañana cena película trabajo reunión gracias vale perfecto jajaja vamos luego ahora tarde noche café playa viaje coche casa madre foto vídeo documento enlace gol partido examen clase deberes'.split(' ');
const EMOJIS = ['😀', '😂', '🥳', '👍', '🙏', '❤️', '🔥', '😅', '🤔', '🎉'];

export function generateChat(opts: SyntheticOptions): string {
  const rand = rng(opts.seed ?? 42);
  const people = opts.participants ?? ['Ana Ejemplo', 'Beto Prueba', 'Carla Muestra'];
  const style = opts.style ?? 'android';
  const out: string[] = [];
  const start = Date.UTC(2020, 0, 1, 8, 0, 0);
  const span = 4 * 365 * 24 * 3600_000;
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
  let mediaCounter = 0;

  for (let i = 0; i < opts.messages; i++) {
    const ts = start + Math.floor((i / opts.messages) * span) + Math.floor(rand() * 1000);
    const d = new Date(ts);
    const date = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)}`;
    const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    const head = style === 'ios' ? `[${date}, ${time}:${pad(d.getUTCSeconds())}] ` : `${date}, ${time} - `;
    const who = people[Math.floor(rand() * people.length)]!;
    const r = rand();
    let body: string;
    if (r < 0.02) {
      out.push(`${head}${who} añadió a ${people[0]}`);
      continue;
    } else if (opts.withMedia && r < 0.07) {
      mediaCounter++;
      const n = `IMG-${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-WA${String(mediaCounter).padStart(4, '0')}.jpg`;
      body = style === 'ios' ? `<attached: ${n}>` : `${n} (archivo adjunto)`;
    } else if (r < 0.15) {
      body = `${WORDS[Math.floor(rand() * WORDS.length)]}\n${WORDS[Math.floor(rand() * WORDS.length)]} ${WORDS[Math.floor(rand() * WORDS.length)]}`;
    } else if (r < 0.2) {
      body = EMOJIS[Math.floor(rand() * EMOJIS.length)]!;
    } else {
      const n = 1 + Math.floor(rand() * 14);
      const ws: string[] = [];
      for (let k = 0; k < n; k++) ws.push(WORDS[Math.floor(rand() * WORDS.length)]!);
      body = ws.join(' ') + (rand() < 0.2 ? ' ' + EMOJIS[Math.floor(rand() * EMOJIS.length)] : '');
    }
    out.push(`${head}${who}: ${body}`);
  }
  return out.join('\n') + '\n';
}
