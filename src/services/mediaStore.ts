import { LIMITS } from './limits';
import type { MediaFile } from './zipReader';

interface Entry {
  file: MediaFile;
  refs: number;
  blob?: Blob;
  url?: string;
  error?: unknown;
  settled?: Promise<void>;
  lastUsed: number;
  controller?: AbortController;
}

export interface MediaHandle {
  url: string;
  blob: Blob;
}

interface QueueItem {
  entry: Entry;
  done: () => void;
}

/**
 * Ciclo de vida de los adjuntos descomprimidos y sus URL temporales.
 *
 *  - `acquire` descomprime bajo demanda (concurrencia limitada) y crea la URL una sola vez.
 *  - `release` reduce el contador; sin referencias, la entrada queda en una caché LRU acotada
 *    y se revoca cuando se supera el presupuesto (LIMITS.idleMediaCache*).
 *  - Una petición que aún no ha empezado y se queda sin referencias (el usuario ha hecho scroll
 *    más allá) se descarta sin descomprimir nada.
 */
export class MediaStore {
  private entries = new Map<string, Entry>();
  private queue: QueueItem[] = [];
  private active = 0;
  private disposed = false;

  /** Para métricas y pruebas. */
  get liveUrlCount(): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.url) n++;
    return n;
  }

  async acquire(file: MediaFile): Promise<MediaHandle> {
    if (this.disposed) throw new Error('disposed');
    let entry = this.entries.get(file.key);
    if (!entry) {
      entry = { file, refs: 0, lastUsed: Date.now() };
      this.entries.set(file.key, entry);
    }
    entry.refs++;
    entry.lastUsed = Date.now();
    if (!entry.settled) entry.settled = new Promise<void>((done) => this.enqueue({ entry: entry!, done }));
    await entry.settled;
    if (entry.error || !entry.blob || !entry.url) {
      entry.refs = Math.max(0, entry.refs - 1); // la carga falló: el llamador no debe llamar a release
      throw entry.error ?? new Error('load-failed');
    }
    return { url: entry.url, blob: entry.blob };
  }

  release(file: MediaFile): void {
    const e = this.entries.get(file.key);
    if (!e) return;
    e.refs = Math.max(0, e.refs - 1);
    e.lastUsed = Date.now();
    if (e.refs === 0) {
      if (!e.blob) e.controller?.abort();
      this.evictIfNeeded();
    }
  }

  /** Obtiene el Blob sin retener la URL (descargas). */
  async getBlob(file: MediaFile): Promise<Blob> {
    const h = await this.acquire(file);
    this.release(file);
    return h.blob;
  }

  dispose(): void {
    this.disposed = true;
    for (const e of this.entries.values()) {
      e.controller?.abort();
      if (e.url) URL.revokeObjectURL(e.url);
    }
    this.entries.clear();
    this.queue = [];
  }

  private enqueue(item: QueueItem): void {
    this.queue.push(item);
    this.pump();
  }

  private pump(): void {
    while (this.active < LIMITS.mediaConcurrency && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.active++;
      void this.run(item.entry).finally(() => {
        this.active--;
        item.done();
        this.pump();
        this.evictIfNeeded();
      });
    }
  }

  private async run(e: Entry): Promise<void> {
    try {
      if (e.refs === 0) throw new Error('cancelled'); // nadie lo espera: no se descomprime
      e.controller = new AbortController();
      e.blob = await e.file.load(e.controller.signal);
      if (this.disposed) return;
      e.url = URL.createObjectURL(e.blob);
    } catch (err) {
      e.error = err;
      // Se olvida la entrada para que un acquire posterior pueda reintentar con una nueva.
      if (this.entries.get(e.file.key) === e) this.entries.delete(e.file.key);
    } finally {
      e.controller = undefined;
    }
  }

  private evictIfNeeded(): void {
    let idleBytes = 0;
    let idleCount = 0;
    const idle: Entry[] = [];
    for (const e of this.entries.values()) {
      if (e.refs === 0 && e.blob) {
        idle.push(e);
        idleBytes += e.blob.size;
        idleCount++;
      }
    }
    const over = () => idleBytes > LIMITS.idleMediaCacheBytes || idleCount > LIMITS.idleMediaCacheEntries;
    if (!over()) return;
    idle.sort((a, b) => a.lastUsed - b.lastUsed);
    for (const e of idle) {
      if (!over()) break;
      idleBytes -= e.blob?.size ?? 0;
      idleCount--;
      if (e.url) URL.revokeObjectURL(e.url);
      this.entries.delete(e.file.key);
    }
  }
}
