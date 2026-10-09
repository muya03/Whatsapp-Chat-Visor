import type { AttachmentRef, ChatMessage } from '../../parser/whatsapp/types';
import type { MediaFile, MediaIndex } from '../../services/zipReader';

export interface ViewableItem {
  msgId: number;
  attIndex: number;
  att: AttachmentRef;
  file: MediaFile;
}

const VIEWABLE = new Set(['image', 'video', 'gif', 'sticker']);

/** Imágenes y vídeos de la conversación que realmente existen en el ZIP, en orden. */
export function collectViewable(messages: ChatMessage[], media: MediaIndex): ViewableItem[] {
  const out: ViewableItem[] = [];
  for (const m of messages) {
    if (m.attachments.length === 0) continue;
    m.attachments.forEach((att, attIndex) => {
      if (att.omitted || !VIEWABLE.has(att.kind)) return;
      const file = media.resolve(att.fileName);
      if (file) out.push({ msgId: m.id, attIndex, att, file });
    });
  }
  return out;
}

export interface DocItem {
  msgId: number;
  att: AttachmentRef;
  file: MediaFile;
}

export function collectDocuments(messages: ChatMessage[], media: MediaIndex): DocItem[] {
  const out: DocItem[] = [];
  for (const m of messages) {
    for (const att of m.attachments) {
      if (att.omitted || VIEWABLE.has(att.kind) || att.kind === 'audio' || att.kind === 'voice') continue;
      const file = media.resolve(att.fileName);
      if (file) out.push({ msgId: m.id, att, file });
    }
  }
  return out;
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const dims = new WeakMap<object, Map<string, { w: number; h: number }>>();
/** Dimensiones ya conocidas de imágenes/vídeos: evitan saltos de altura al volver a montar una fila. */
export function dimsCache(owner: object): Map<string, { w: number; h: number }> {
  let m = dims.get(owner);
  if (!m) dims.set(owner, (m = new Map()));
  return m;
}
