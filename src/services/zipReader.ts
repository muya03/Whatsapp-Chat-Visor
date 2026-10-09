import { BlobReader, ZipReader, configure, type FileEntry } from '@zip.js/zip.js';
import { baseName, attachmentKey, looseAttachmentKey } from '../parser/whatsapp/text';
import { ImportError, isSafeEntryPath } from './fileValidation';
import { LIMITS } from './limits';
import { mimeFromName } from './mime';

// La descompresión usa DecompressionStream nativo cuando existe (fuera del hilo principal).
// Sin Web Workers de zip.js: no hace falta y evita crear workers desde blobs.
configure({ useWebWorkers: false });

export interface ZipEntryInfo {
  /** Ruta interna tal cual (para mostrar al elegir TXT). */
  path: string;
  name: string;
  size: number;
  encrypted: boolean;
  entry: FileEntry;
}

export interface ZipArchive {
  entries: ZipEntryInfo[];
  /** Entradas .txt que podrían ser el chat, ordenadas por probabilidad. */
  chatCandidates: ZipEntryInfo[];
  skippedUnsafe: number;
  truncated: boolean;
  close(): Promise<void>;
}

const HIDDEN_RE = /(^|\/)(__MACOSX\/|\._|\.DS_Store$|Thumbs\.db$)/;

function chatScore(e: ZipEntryInfo): number {
  const n = e.name.toLowerCase();
  let s = 0;
  if (n === '_chat.txt') s += 100;
  if (/^(whatsapp chat|chat de whatsapp|chat de|conversa do whatsapp|conversation whatsapp|whatsapp-chat|whatsapp chat with)/.test(n)) s += 60;
  if (n.includes('chat')) s += 20;
  if (!e.path.includes('/')) s += 5;
  return s + Math.min(10, Math.log10(Math.max(1, e.size)));
}

/**
 * Abre un ZIP SIN cargarlo en memoria: zip.js lee el directorio central mediante `Blob.slice`.
 * Los adjuntos se descomprimen más tarde, uno a uno, solo cuando hacen falta.
 */
export async function openZip(file: Blob, signal?: AbortSignal): Promise<ZipArchive> {
  const reader = new ZipReader(new BlobReader(file), signal ? { signal } : undefined);
  let all;
  try {
    // 'tolerant': zip.js no rechaza el archivo entero por una entrada con ".."; esas entradas se
    // descartan más abajo con isSafeEntryPath (nunca se escribe nada en disco, solo se leen blobs).
    all = await reader.getEntries({ filenameValidation: 'tolerant' });
  } catch (e) {
    await reader.close().catch(() => undefined);
    if (signal?.aborted) throw new ImportError('cancelled');
    throw new ImportError('zip-corrupt');
  }

  const entries: ZipEntryInfo[] = [];
  let skippedUnsafe = 0;
  let truncated = false;
  for (const e of all) {
    if (e.directory) continue;
    if (HIDDEN_RE.test(e.filename)) continue;
    if (!isSafeEntryPath(e.filename)) {
      skippedUnsafe++;
      continue;
    }
    if (entries.length >= LIMITS.maxZipEntries) {
      truncated = true;
      break;
    }
    entries.push({
      path: e.filename,
      name: baseName(e.filename),
      size: e.uncompressedSize,
      encrypted: e.encrypted,
      entry: e,
    });
  }

  const chatCandidates = entries
    .filter((e) => /\.txt$/i.test(e.name))
    .sort((a, b) => chatScore(b) - chatScore(a));

  return {
    entries,
    chatCandidates,
    skippedUnsafe,
    truncated,
    close: () => reader.close().catch(() => undefined),
  };
}

/** Descomprime una entrada a Blob con tope de bytes (defensa frente a ZIP con tamaño declarado falso). */
export async function readEntryBlob(info: ZipEntryInfo, limitBytes: number, signal?: AbortSignal): Promise<Blob> {
  if (info.encrypted) throw new ImportError('zip-encrypted');
  if (info.size > limitBytes) throw new ImportError('too-large', { size: info.size, limit: limitBytes });
  const chunks: Uint8Array[] = [];
  let total = 0;
  const sink = new WritableStream<Uint8Array>({
    write(chunk) {
      total += chunk.byteLength;
      if (total > limitBytes) throw new ImportError('too-large', { size: total, limit: limitBytes });
      chunks.push(chunk);
    },
  });
  try {
    await info.entry.getData(sink, signal ? { signal } : undefined);
  } catch (e) {
    if (e instanceof ImportError) throw e;
    if (signal?.aborted) throw new ImportError('cancelled');
    if (e instanceof RangeError || (e as Error)?.name === 'QuotaExceededError') throw new ImportError('memory');
    throw new ImportError('zip-corrupt');
  }
  return new Blob(chunks as BlobPart[], { type: mimeFromName(info.name) });
}

export interface MediaFile {
  key: string;
  name: string;
  size: number;
  mime: string;
  load(signal?: AbortSignal): Promise<Blob>;
}

/** Índice nombre→archivo para relacionar los adjuntos citados en el chat con las entradas del ZIP. */
export class MediaIndex {
  private exact = new Map<string, ZipEntryInfo>();
  private loose = new Map<string, ZipEntryInfo | null>();
  readonly count: number;

  constructor(entries: ZipEntryInfo[], exclude?: ZipEntryInfo) {
    let n = 0;
    for (const e of entries) {
      if (e === exclude) continue;
      const key = attachmentKey(e.name);
      if (!this.exact.has(key)) this.exact.set(key, e);
      const lk = looseAttachmentKey(e.name);
      // Clave laxa ambigua (dos archivos que solo difieren en tildes/espacios) → null: no se adivina.
      this.loose.set(lk, this.loose.has(lk) ? null : e);
      n++;
    }
    this.count = n;
  }

  resolve(fileName: string | null): MediaFile | null {
    if (!fileName) return null;
    const hit = this.exact.get(attachmentKey(fileName)) ?? this.loose.get(looseAttachmentKey(fileName)) ?? null;
    if (!hit) return null;
    const mime = mimeFromName(hit.name);
    return {
      key: attachmentKey(hit.name),
      name: hit.name,
      size: hit.size,
      mime,
      load: (signal) => readEntryBlob(hit, LIMITS.maxMediaBytes, signal),
    };
  }
}

/** Para pruebas y fuentes sin ZIP. */
export const EMPTY_MEDIA_INDEX = new MediaIndex([]);
