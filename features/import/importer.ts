import type { DateOrderSetting, ParsedChat } from '../../parser/whatsapp/types';
import { ImportError, validateFile } from '../../services/fileValidation';
import { LIMITS } from '../../services/limits';
import { MediaStore } from '../../services/mediaStore';
import { EMPTY_MEDIA_INDEX, MediaIndex, openZip, readEntryBlob, type ZipArchive, type ZipEntryInfo } from '../../services/zipReader';
import { ChatClient } from './chatClient';

export type ImportStage = 'validating' | 'zip-index' | 'extract-chat' | 'parse' | 'done';

export interface ImportProgress {
  stage: ImportStage;
  /** 0..1 aproximado del conjunto de la importación. */
  ratio: number;
}

/** Lo que el importador entrega a la aplicación: todo lo necesario para leer la conversación. */
export interface ImportedChat {
  fileName: string;
  fileSize: number;
  sourceKind: 'txt' | 'zip';
  chatBlob: Blob;
  chatEntryName: string | null;
  chat: ParsedChat;
  media: MediaIndex;
  mediaStore: MediaStore;
  zip: ZipArchive | null;
  client: ChatClient;
  /** Archivo original (solo se conserva si el usuario activa guardar en el dispositivo). */
  source: File;
  /** Avisos no fatales (entradas inseguras ignoradas, ZIP truncado...). */
  notes: { code: 'zip-unsafe-entries' | 'zip-truncated' | 'zip-no-media' | 'large-zip'; count?: number }[];
}

export interface ImportOptions {
  signal?: AbortSignal;
  dateOrder?: DateOrderSetting;
  onProgress?: (p: ImportProgress) => void;
  /** Se invoca cuando el ZIP contiene varios TXT candidatos; devuelve el elegido o null para cancelar. */
  chooseEntry?: (candidates: ZipEntryInfo[]) => Promise<ZipEntryInfo | null>;
}

export async function importFile(file: File, options: ImportOptions = {}): Promise<ImportedChat> {
  const { signal, onProgress } = options;
  const report = (stage: ImportStage, ratio: number) => onProgress?.({ stage, ratio });
  const throwIfAborted = () => {
    if (signal?.aborted) throw new ImportError('cancelled');
  };

  report('validating', 0);
  const validated = await validateFile(file);
  throwIfAborted();

  let zip: ZipArchive | null = null;
  let client: ChatClient | null = null;
  let mediaStore: MediaStore | null = null;
  const notes: ImportedChat['notes'] = [];
  try {
    let chatBlob: Blob = file;
    let chatEntryName: string | null = null;
    let media: MediaIndex = EMPTY_MEDIA_INDEX;

    if (validated.kind === 'zip') {
      if (validated.large) notes.push({ code: 'large-zip' });
      report('zip-index', 0.05);
      zip = await openZip(file, signal);
      throwIfAborted();
      if (zip.skippedUnsafe > 0) notes.push({ code: 'zip-unsafe-entries', count: zip.skippedUnsafe });
      if (zip.truncated) notes.push({ code: 'zip-truncated', count: LIMITS.maxZipEntries });

      if (zip.chatCandidates.length === 0) {
        throw new ImportError('zip-no-chat', { entries: zip.entries.length });
      }
      let chosen: ZipEntryInfo | null | undefined = zip.chatCandidates[0];
      if (zip.chatCandidates.length > 1) {
        chosen = options.chooseEntry ? await options.chooseEntry(zip.chatCandidates) : zip.chatCandidates[0];
        if (!chosen) throw new ImportError('cancelled');
      }
      if (!chosen) throw new ImportError('zip-no-chat', { entries: zip.entries.length });
      report('extract-chat', 0.12);
      chatBlob = await readEntryBlob(chosen, LIMITS.maxChatEntryBytes, signal);
      chatEntryName = chosen.path;
      media = new MediaIndex(zip.entries, chosen);
      if (media.count === 0) notes.push({ code: 'zip-no-media' });
    }
    throwIfAborted();

    client = new ChatClient();
    const abort = () => client?.terminate();
    signal?.addEventListener('abort', abort, { once: true });
    let outcome;
    try {
      outcome = await client.parse(chatBlob, options.dateOrder ?? 'auto', (r) => report('parse', 0.2 + r * 0.8));
    } finally {
      signal?.removeEventListener('abort', abort);
    }
    throwIfAborted();

    const { chat } = outcome;
    const recognized = chat.messages.some((m) => m.system !== 'unparsed');
    if (chat.messages.length === 0 || !recognized) {
      throw new ImportError('txt-not-recognized', { lines: chat.lineCount });
    }
    mediaStore = new MediaStore();
    report('done', 1);
    return {
      fileName: file.name,
      fileSize: file.size,
      sourceKind: validated.kind,
      chatBlob,
      chatEntryName,
      chat,
      media,
      mediaStore,
      zip,
      client,
      source: file,
      notes,
    };
  } catch (e) {
    client?.terminate();
    mediaStore?.dispose();
    await zip?.close();
    if (e instanceof ImportError) throw e;
    if (e instanceof RangeError) throw new ImportError('memory');
    throw new ImportError(signal?.aborted ? 'cancelled' : 'unknown');
  }
}

/** Libera todo lo asociado a una conversación (worker, URL temporales, lector del ZIP). */
export function disposeImported(i: Pick<ImportedChat, 'client' | 'mediaStore' | 'zip'>): void {
  i.client.terminate();
  i.mediaStore.dispose();
  void i.zip?.close();
}
