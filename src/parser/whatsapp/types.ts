/**
 * Modelo normalizado de una conversación de WhatsApp.
 * Es el único contrato entre el analizador (parser/) y la interfaz (components/):
 * la UI nunca ve líneas de texto crudas y el parser nunca produce HTML.
 */

export type DateOrder = 'DMY' | 'MDY' | 'YMD';
export type DateOrderSetting = 'auto' | DateOrder;

export type MediaKind =
  | 'image'
  | 'video'
  | 'gif'
  | 'audio'
  | 'voice'
  | 'sticker'
  | 'document'
  | 'contact'
  | 'archive'
  | 'unknown';

export interface AttachmentRef {
  /** Nombre del archivo tal y como aparece en el chat (null si solo consta "omitido"). */
  fileName: string | null;
  /** Clave normalizada para localizarlo en el ZIP (null si no hay nombre). */
  key: string | null;
  kind: MediaKind;
  /** true cuando la exportación se hizo "sin multimedia" y solo queda el marcador. */
  omitted: boolean;
}

export type SystemKind =
  | 'encryption'
  | 'group-created'
  | 'participant-added'
  | 'participant-left'
  | 'participant-removed'
  | 'subject-changed'
  | 'icon-changed'
  | 'description-changed'
  | 'settings-changed'
  | 'security-code'
  | 'joined-link'
  | 'unparsed'
  | 'other';

export type MessageKind = 'text' | 'media' | 'deleted' | 'call' | 'location' | 'system';

export interface ChatMessage {
  /** Identificador estable = posición en el array = orden original del archivo. */
  id: number;
  /** Línea (1-based) del archivo donde empieza el mensaje. */
  line: number;
  /**
   * Hora de pared codificada como milisegundos UTC (Date.UTC(y, m-1, d, h, mi, s)).
   * NO es un instante real: no existe zona horaria y nunca se convierte, así la hora
   * que se muestra es exactamente la que escribió WhatsApp.
   */
  ts: number | null;
  /** yyyymmdd (p. ej. 20221214) para agrupar por día; null si no hay fecha reconocible. */
  dayKey: number | null;
  /** Texto original de fecha+hora. Solo se conserva (no vacío) cuando ts es null, como respaldo visible. */
  rawTime: string;
  sender: string | null;
  text: string;
  kind: MessageKind;
  system?: SystemKind;
  attachments: AttachmentRef[];
  /** Enlace de mapas cuando kind === 'location'. */
  locationUrl?: string;
}

export interface Participant {
  name: string;
  count: number;
}

export interface ParseIssue {
  code:
    | 'leading-lines'
    | 'timestamp-like-line'
    | 'invalid-date'
    | 'unsupported-calendar'
    | 'ambiguous-date-order'
    | 'inconsistent-date-order'
    | 'encoding-fallback'
    | 'chronology';
  /** Línea de referencia (1-based) o null si afecta a todo el archivo. */
  line: number | null;
  /** Número de ocurrencias agregadas bajo este código. */
  count: number;
}

export interface ChatStats {
  perParticipant: { name: string; count: number }[];
  perHour: number[];
  /** Mensajes por mes: [yyyymm, n] ordenados cronológicamente. */
  perMonth: [number, number][];
  media: Partial<Record<MediaKind, number>>;
  attachmentsTotal: number;
  topEmojis: { emoji: string; count: number }[];
  topWords: { word: string; count: number }[];
  firstDay: number | null;
  lastDay: number | null;
  messageCount: number;
  systemCount: number;
}

export interface ParsedChat {
  messages: ChatMessage[];
  participants: Participant[];
  isGroup: boolean;
  /** Nombre del grupo deducido del propio archivo (mensaje "creó el grupo «X»"), si existe. */
  groupNameHint: string | null;
  dateOrder: DateOrder;
  /** true cuando el archivo no permite decidir entre DMY y MDY y hay que ofrecer corrección. */
  dateOrderAmbiguous: boolean;
  /** true si el archivo usa marcadores AM/PM. */
  sourceHour12: boolean;
  platform: 'ios' | 'android' | 'unknown';
  issues: ParseIssue[];
  lineCount: number;
  /** Líneas totales que no se pudieron situar en ningún mensaje (para informar al usuario). */
  recoveredLines: number;
}

export interface ParseOptions {
  dateOrder?: DateOrderSetting;
  /** Se llama de forma periódica con un valor 0..1. */
  onProgress?: (ratio: number) => void;
  /** Para abortar desde el worker/tests (se comprueba entre bloques de líneas). */
  isCancelled?: () => boolean;
}
