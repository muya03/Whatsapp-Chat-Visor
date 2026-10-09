import type { ParsedChat } from '../../parser/whatsapp/types';

const PREFIX_RE =
  /^(?:whatsapp chat (?:with|-)|chat de whatsapp con|chat de whatsapp|conversa do whatsapp com|conversa do whatsapp|conversation whatsapp avec|whatsapp[- ]chat (?:mit|met)|chat whatsapp con|whatsapp-chat)\s*[-–: ]*/i;

/** Nombre sugerido a partir del nombre del archivo exportado («Chat de WhatsApp con Ana.zip» → «Ana»). */
export function titleFromFileName(fileName: string): string | null {
  const base = fileName.replace(/\.(zip|txt)$/i, '').replace(/\s*\(\d+\)$/, '').trim();
  if (!base || /^_?chat$/i.test(base)) return null;
  const stripped = base.replace(PREFIX_RE, '').trim();
  return stripped || null;
}

/**
 * Nombre mostrado de la conversación, por orden de prioridad:
 * personalizado → el otro participante (chat de 2 con "yo" identificado) → nombre de archivo → grupo detectado → participantes.
 */
export function conversationTitle(
  chat: ParsedChat,
  fileName: string,
  me: string | null,
  custom: string | null,
): string {
  if (custom && custom.trim()) return custom.trim();
  if (!chat.isGroup && chat.participants.length === 2 && me) {
    const other = chat.participants.find((p) => p.name !== me);
    if (other) return other.name;
  }
  const fromFile = titleFromFileName(fileName);
  if (fromFile) return fromFile;
  if (chat.groupNameHint) return chat.groupNameHint;
  if (chat.participants.length > 0) return chat.participants.slice(0, 3).map((p) => p.name).join(', ');
  return 'Conversación';
}

/** Línea secundaria de la cabecera: nombres en grupos, resumen en chats individuales (sin inventar "en línea"). */
export function conversationSubtitle(
  chat: ParsedChat,
  stats: { firstDay: number | null } | null,
  fmtDate: (d: number) => string,
  fmtCount: (n: number) => string,
): string {
  if (chat.isGroup && chat.participants.length > 0) return chat.participants.map((p) => p.name).join(', ');
  const count = chat.messages.reduce((n, m) => n + (m.kind === 'system' ? 0 : 1), 0);
  const first = stats?.firstDay ?? chat.messages.find((m) => m.dayKey !== null)?.dayKey ?? null;
  return first ? `${fmtCount(count)} · desde ${fmtDate(first)}` : fmtCount(count);
}
