import type { ChatStats, DateOrderSetting, ParsedChat } from '../../parser/whatsapp/types';
import { ImportError, type ImportErrorCode } from '../../services/fileValidation';
import { ChatEngine } from '../../workers/engine';
import type { WorkerRequest, WorkerResponse } from '../../workers/protocol';

export interface ParseOutcome {
  chat: ParsedChat;
}

/**
 * Cliente del motor de análisis/búsqueda de UNA conversación.
 * Usa un Web Worker; si el entorno no lo permite (tests, navegadores muy antiguos) cae a un
 * motor en el hilo principal con la misma interfaz.
 */
export class ChatClient {
  private worker: Worker | null = null;
  private inline: ChatEngine | null = null;
  private jobId = 0;
  private reqId = 0;
  private parseWaiters = new Map<number, { resolve: (o: ParseOutcome) => void; reject: (e: unknown) => void; onProgress: (r: number) => void }>();
  private searchWaiters = new Map<number, (hits: Int32Array) => void>();
  private statsWaiters = new Map<number, (s: ChatStats) => void>();
  private statsPromise: Promise<ChatStats> | null = null;
  private terminated = false;

  constructor() {
    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('../../workers/parsing.worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.onMessage(e.data);
        this.worker.onerror = () => this.failWaiters(new ImportError('unknown'));
      } catch {
        this.worker = null;
      }
    }
    if (!this.worker) this.inline = new ChatEngine();
  }

  get usesWorker(): boolean {
    return this.worker !== null;
  }

  parse(source: Blob, dateOrder: DateOrderSetting, onProgress: (ratio: number) => void): Promise<ParseOutcome> {
    if (this.terminated) return Promise.reject(new ImportError('cancelled'));
    const jobId = ++this.jobId;
    if (this.inline) {
      return this.inline.parse(source, dateOrder, onProgress).catch((e) => {
        throw e instanceof ImportError ? e : (e as Error).message === 'cancelled' ? new ImportError('cancelled') : e instanceof RangeError ? new ImportError('memory') : new ImportError('unknown');
      });
    }
    return new Promise((resolve, reject) => {
      this.parseWaiters.set(jobId, { resolve, reject, onProgress });
      const req: WorkerRequest = { type: 'parse', jobId, source, dateOrder };
      this.worker!.postMessage(req);
    });
  }

  search(query: string): Promise<Int32Array> {
    if (this.terminated) return Promise.resolve(new Int32Array(0));
    if (this.inline) return Promise.resolve(this.inline.search(query));
    const reqId = ++this.reqId;
    return new Promise((resolve) => {
      this.searchWaiters.set(reqId, resolve);
      const req: WorkerRequest = { type: 'search', reqId, query };
      this.worker!.postMessage(req);
    });
  }

  /** Estadísticas (se calculan una vez, en segundo plano, tras la importación). */
  stats(): Promise<ChatStats> {
    if (this.statsPromise) return this.statsPromise;
    if (this.terminated) return Promise.reject(new ImportError('cancelled'));
    if (this.inline) {
      const engine = this.inline;
      this.statsPromise = new Promise((resolve) => setTimeout(() => resolve(engine.stats()), 0));
    } else {
      const reqId = ++this.reqId;
      this.statsPromise = new Promise((resolve) => {
        this.statsWaiters.set(reqId, resolve);
        this.worker!.postMessage({ type: 'stats', reqId } satisfies WorkerRequest);
      });
    }
    return this.statsPromise;
  }

  terminate(): void {
    this.terminated = true;
    this.worker?.terminate();
    this.worker = null;
    this.inline?.dispose();
    this.failWaiters(new ImportError('cancelled'));
    for (const r of this.searchWaiters.values()) r(new Int32Array(0));
    this.searchWaiters.clear();
  }

  private failWaiters(err: unknown) {
    for (const w of this.parseWaiters.values()) w.reject(err);
    this.parseWaiters.clear();
  }

  private onMessage(msg: WorkerResponse) {
    if (msg.type === 'progress') this.parseWaiters.get(msg.jobId)?.onProgress(msg.ratio);
    else if (msg.type === 'parsed') {
      const w = this.parseWaiters.get(msg.jobId);
      this.parseWaiters.delete(msg.jobId);
      w?.resolve(msg.result);
    } else if (msg.type === 'parse-error') {
      const w = this.parseWaiters.get(msg.jobId);
      this.parseWaiters.delete(msg.jobId);
      w?.reject(new ImportError(msg.code as ImportErrorCode, msg.detail));
    } else if (msg.type === 'stats') {
      const w = this.statsWaiters.get(msg.reqId);
      this.statsWaiters.delete(msg.reqId);
      w?.(msg.stats);
    } else if (msg.type === 'searched') {
      const w = this.searchWaiters.get(msg.reqId);
      this.searchWaiters.delete(msg.reqId);
      w?.(msg.hits);
    }
  }
}
