import { extractAttachments } from './attachmentParser';
import {
  candidateLooksLikeSystem,
  classifySystemText,
  isCallText,
  isDeletedText,
  matchLocation,
  matchOmittedMarker,
} from './systemMessages';
import type { AttachmentRef, ChatMessage, MessageKind, SystemKind } from './types';

/** Un único array vacío compartido por todos los mensajes sin adjuntos (ahorra memoria). */
export const NO_ATTACHMENTS: AttachmentRef[] = [];

/**
 * Separa el resto de una línea de cabecera en remitente + contenido.
 *
 * Una línea sin remitente (p. ej. «Ana creó el grupo "Foo"») es un aviso del sistema. El primer
 * «: » solo separa remitente y texto si lo que hay antes parece un nombre: corto, sin comillas
 * y sin pinta de frase de aviso («Se cambió el asunto de "A: B"…»). Los números de teléfono con
 * espacios («+34 612 34 56 78») son nombres válidos, de ahí el límite holgado de palabras.
 */
export function splitSender(rest: string): { sender: string | null; content: string } {
  const idx = rest.search(/:(?:\s|$)/);
  if (idx > 0) {
    const candidate = rest.slice(0, idx).trim();
    const words = candidate.split(/\s+/).length;
    if (
      candidate.length > 0 &&
      candidate.length <= 64 &&
      words <= 7 &&
      !/["“”«»„]/.test(candidate) &&
      !candidateLooksLikeSystem(candidate)
    ) {
      return { sender: candidate, content: rest.slice(idx + 1).replace(/^\s/, '') };
    }
  }
  return { sender: null, content: rest.trim() };
}

export interface BodyClassification {
  kind: MessageKind;
  system?: SystemKind;
  text: string;
  attachments: AttachmentRef[];
  locationUrl?: string;
}

/** Interpreta el cuerpo (ya con todas sus líneas) de un mensaje con o sin remitente. */
export function classifyBody(sender: string | null, body: string): BodyClassification {
  const trimmed = body.replace(/^[‎‏﻿]+/, '').replace(/\s+$/, '');

  if (sender === null) {
    return { kind: 'system', system: classifySystemText(trimmed), text: trimmed, attachments: NO_ATTACHMENTS };
  }
  if (isDeletedText(trimmed)) return { kind: 'deleted', text: trimmed, attachments: NO_ATTACHMENTS };
  if (isCallText(trimmed)) return { kind: 'call', text: trimmed, attachments: NO_ATTACHMENTS };

  const omitted = matchOmittedMarker(trimmed);
  if (omitted) {
    return { kind: 'media', text: '', attachments: [{ fileName: null, key: null, kind: omitted, omitted: true }] };
  }

  const { attachments, text } = extractAttachments(trimmed);
  if (attachments.length > 0) return { kind: 'media', text, attachments };

  const loc = matchLocation(trimmed);
  if (loc) return { kind: 'location', text: trimmed, attachments: NO_ATTACHMENTS, locationUrl: loc };

  return { kind: 'text', text: trimmed, attachments: NO_ATTACHMENTS };
}

export function buildMessage(args: {
  id: number;
  line: number;
  ts: number | null;
  dayKey: number | null;
  rawTime: string;
  sender: string | null;
  body: string;
}): ChatMessage {
  const c = classifyBody(args.sender, args.body);
  const msg: ChatMessage = {
    id: args.id,
    line: args.line,
    ts: args.ts,
    dayKey: args.dayKey,
    rawTime: args.rawTime,
    sender: args.sender,
    text: c.text,
    kind: c.kind,
    attachments: c.attachments,
  };
  if (c.system) msg.system = c.system;
  if (c.locationUrl) msg.locationUrl = c.locationUrl;
  return msg;
}
