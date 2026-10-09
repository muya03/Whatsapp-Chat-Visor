import { dayKeyOf, looksLikeTimestampLine, matchHeader, resolveDate, toWallClock, type HeaderMatch } from './dateParser';
import { decideDateOrder, detectPlatform, type DateSample } from './formatDetector';
import { buildMessage, splitSender } from './messageParser';
import { stripInvisible } from './text';
import type { ChatMessage, ParseIssue, ParseOptions, ParsedChat, Participant } from './types';

interface RawRecord {
  line: number;
  header: HeaderMatch;
  sender: string | null;
  body: string;
}

const PROGRESS_EVERY = 20_000;

/**
 * Analiza el texto de una exportación `_chat.txt` y devuelve la conversación normalizada.
 * No lanza por líneas raras: las conserva y las notifica en `issues`.
 *
 * Pasos:
 *  1. Barrido de líneas: cada cabecera abre un registro; lo demás es continuación (multilínea).
 *  2. Inferencia del orden de fecha sobre todas las cabeceras.
 *  3. Construcción de mensajes (fecha normalizada, remitente, tipo, adjuntos).
 */
export function parseChat(input: string, options: ParseOptions = {}): ParsedChat {
  const { onProgress, isCancelled } = options;
  const lines = input.split(/\r\n|\n|\r/);
  const issues = new Map<ParseIssue['code'], ParseIssue>();
  const addIssue = (code: ParseIssue['code'], line: number | null) => {
    const prev = issues.get(code);
    if (prev) prev.count++;
    else issues.set(code, { code, line, count: 1 });
  };

  const records: RawRecord[] = [];
  const leading: string[] = [];
  let current: RawRecord | null = null;
  let recoveredLines = 0;
  let bracketed = 0;
  let plain = 0;
  let hour12 = false;

  for (let i = 0; i < lines.length; i++) {
    if (i % PROGRESS_EVERY === 0) {
      if (isCancelled?.()) throw new Error('cancelled');
      onProgress?.((i / lines.length) * 0.6);
    }
    const raw = lines[i] ?? '';
    const stripped = stripInvisible(raw);
    const header = matchHeader(stripped);
    if (header) {
      const rest = stripped.slice(header.restStart);
      const { sender, content } = splitSender(rest);
      current = { line: i + 1, header, sender, body: content };
      records.push(current);
      if (header.bracketed) bracketed++;
      else plain++;
      if (header.period) hour12 = true;
      continue;
    }
    // Continuación (o texto previo a la primera cabecera).
    if (current) {
      current.body += '\n' + raw;
      if (stripped.length > 0 && looksLikeTimestampLine(stripped)) {
        // Parece una cabecera pero no la hemos podido leer: se conserva dentro del mensaje anterior y se avisa.
        addIssue('timestamp-like-line', i + 1);
        recoveredLines++;
      }
    } else if (stripped.trim().length > 0) {
      leading.push(raw);
      recoveredLines++;
    }
  }

  // Un archivo vacío o sin ninguna cabecera reconocible devuelve conversación vacía; la UI lo explica.
  const samples: DateSample[] = records.map((r) => ({
    a: r.header.parts[0],
    b: r.header.parts[1],
    c: r.header.parts[2],
    firstLen: r.header.partLengths[0],
    lastLen: r.header.partLengths[2],
  }));
  const decision = decideDateOrder(samples, options.dateOrder ?? 'auto');
  if (decision.ambiguous) addIssue('ambiguous-date-order', null);
  if (decision.inconsistent) addIssue('inconsistent-date-order', null);

  const messages: ChatMessage[] = [];
  if (leading.length > 0) {
    addIssue('leading-lines', 1);
    messages.push(
      buildMessage({ id: 0, line: 1, ts: null, dayKey: null, rawTime: '', sender: null, body: leading.join('\n') }),
    );
    messages[0]!.system = 'unparsed';
  }

  const counts = new Map<string, number>();
  const names = new Map<string, string>();
  const intern = (n: string) => {
    const hit = names.get(n);
    if (hit !== undefined) return hit;
    const flat = (' ' + n).slice(1); // fuerza copia: no retiene la línea completa de origen
    names.set(flat, flat);
    return flat;
  };
  let lastTs = -Infinity;
  for (let i = 0; i < records.length; i++) {
    if (i % PROGRESS_EVERY === 0) {
      if (isCancelled?.()) throw new Error('cancelled');
      onProgress?.(0.6 + (i / Math.max(1, records.length)) * 0.4);
    }
    const r = records[i]!;
    const h = r.header;
    const date = resolveDate(h.parts, h.partLengths, decision.order);
    let ts: number | null = null;
    let dayKey: number | null = null;
    if (date) {
      ts = toWallClock(date, h.hour, h.minute, h.second, h.period);
      dayKey = ts === null ? null : dayKeyOf(date);
    }
    if (ts === null) {
      const persian = h.partLengths.some((l) => l >= 4) && h.parts.some((p) => p >= 1300 && p <= 1499);
      addIssue(persian ? 'unsupported-calendar' : 'invalid-date', r.line);
    } else {
      if (ts < lastTs - 36 * 3600_000) addIssue('chronology', r.line);
      lastTs = Math.max(lastTs, ts);
    }
    const msg = buildMessage({
      id: messages.length,
      line: r.line,
      ts,
      dayKey,
      // La representación original solo se conserva cuando la fecha no se pudo normalizar.
      rawTime: ts === null ? h.rawTime : '',
      sender: r.sender === null ? null : intern(r.sender),
      body: r.body,
    });
    messages.push(msg);
    if (msg.sender) counts.set(msg.sender, (counts.get(msg.sender) ?? 0) + 1);
  }
  onProgress?.(1);

  const participants: Participant[] = [...counts.entries()].map(([name, count]) => ({ name, count }));
  let groupNameHint: string | null = null;
  let groupSignals = false;
  for (const m of messages) {
    if (m.kind !== 'system') continue;
    if (m.system === 'group-created') {
      groupSignals = true;
      groupNameHint ??= m.text.match(/["“«„]([^"”»“]+)["”»“]/)?.[1]?.trim() ?? null;
    } else if (m.system === 'participant-added' || m.system === 'subject-changed' || m.system === 'participant-left' || m.system === 'joined-link') {
      groupSignals = true;
    }
  }

  return {
    messages,
    participants,
    isGroup: participants.length > 2 || groupSignals,
    groupNameHint,
    dateOrder: decision.order,
    dateOrderAmbiguous: decision.ambiguous,
    sourceHour12: hour12,
    platform: detectPlatform(bracketed, plain),
    issues: [...issues.values()],
    lineCount: lines.length,
    recoveredLines,
  };
}
