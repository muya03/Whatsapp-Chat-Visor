import { SearchIndex } from '../features/search/searchIndex';
import { parseChat } from '../parser/whatsapp/parser';
import { computeStats } from '../parser/whatsapp/stats';
import type { ChatStats, DateOrderSetting, ParsedChat } from '../parser/whatsapp/types';
import { ImportError } from '../services/fileValidation';

/**
 * Decodifica el TXT. UTF-8 estricto primero (formato de WhatsApp); BOM UTF-16 si lo hubiera;
 * y como último recurso Windows-1252, avisando al usuario de que puede haber caracteres mal leídos.
 */
export function decodeText(buf: ArrayBuffer): { text: string; fallback: boolean } {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(buf), fallback: false };
  if (u8[0] === 0xfe && u8[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(buf), fallback: false };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), fallback: false };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(buf), fallback: true };
  }
}

export interface ParseResult {
  chat: ParsedChat;
}

/**
 * Lógica de importación/búsqueda independiente de dónde se ejecute (Worker o hilo principal).
 * Retiene únicamente el índice de búsqueda (cadenas plegadas), no una segunda copia del chat.
 */
export class ChatEngine {
  private index: SearchIndex | null = null;
  private generation = 0;
  private statsCache: ChatStats | null = null;
  private pendingMessages: ParsedChat['messages'] | null = null;

  async parse(
    source: Blob,
    dateOrder: DateOrderSetting,
    onProgress: (ratio: number) => void,
  ): Promise<ParseResult> {
    const gen = ++this.generation;
    onProgress(0);
    let buf: ArrayBuffer;
    try {
      buf = await source.arrayBuffer();
    } catch {
      throw new ImportError('memory');
    }
    const { text, fallback } = decodeText(buf);
    onProgress(0.08);
    const chat = parseChat(text, {
      dateOrder,
      onProgress: (r) => onProgress(0.08 + r * 0.7),
      isCancelled: () => gen !== this.generation,
    });
    if (fallback) chat.issues.push({ code: 'encoding-fallback', line: null, count: 1 });
    this.statsCache = null;
    this.pendingMessages = null;
    if (chat.messages.length === 0 || chat.messages.every((m) => m.system === 'unparsed')) {
      this.index = null;
      return { chat };
    }
    const index = new SearchIndex(chat.messages, (r) => onProgress(0.78 + r * 0.2));
    if (gen !== this.generation) throw new Error('cancelled');
    this.index = index;
    this.pendingMessages = chat.messages;
    onProgress(1);
    return { chat };
  }

  /**
   * Estadísticas de la conversación. Se calculan después de entregar el chat (no retrasan la primera
   * pantalla) y, una vez calculadas, el motor suelta su referencia a los mensajes.
   */
  stats(): ChatStats {
    if (this.statsCache) return this.statsCache;
    const stats = computeStats(this.pendingMessages ?? []);
    this.statsCache = stats;
    this.pendingMessages = null;
    return stats;
  }

  search(query: string): Int32Array {
    return this.index ? this.index.search(query) : new Int32Array(0);
  }

  dispose(): void {
    this.generation++;
    this.index = null;
    this.pendingMessages = null;
    this.statsCache = null;
  }
}
