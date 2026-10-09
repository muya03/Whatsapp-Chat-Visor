import { fold } from '../../parser/whatsapp/text';
import type { ChatMessage } from '../../parser/whatsapp/types';

/**
 * Índice de búsqueda sobre TODA la conversación (no solo lo renderizado).
 * Texto plegado (minúsculas, sin tildes) de remitente + texto + nombres de adjuntos.
 * Se construye una sola vez al importar y vive en el worker; la búsqueda es un barrido de indexOf.
 */
export class SearchIndex {
  private corpus: string[];

  constructor(messages: ChatMessage[], onProgress?: (ratio: number) => void) {
    this.corpus = new Array<string>(messages.length);
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]!;
      let s = m.text;
      if (m.sender) s = m.sender + '\n' + s;
      for (const a of m.attachments) if (a.fileName) s += '\n' + a.fileName;
      this.corpus[i] = fold(s);
      if (onProgress && i % 25_000 === 0) onProgress(i / messages.length);
    }
  }

  get size(): number {
    return this.corpus.length;
  }

  /** Índices (ids de mensaje, en orden) que contienen la consulta. */
  search(query: string): Int32Array {
    const q = fold(query.trim());
    if (!q) return new Int32Array(0);
    const hits: number[] = [];
    const c = this.corpus;
    for (let i = 0; i < c.length; i++) if (c[i]!.indexOf(q) !== -1) hits.push(i);
    return Int32Array.from(hits);
  }
}
