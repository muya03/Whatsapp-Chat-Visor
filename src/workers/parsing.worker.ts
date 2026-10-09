/// <reference lib="webworker" />
import { ImportError } from '../services/fileValidation';
import { ChatEngine } from './engine';
import type { WorkerRequest, WorkerResponse } from './protocol';

/**
 * Worker de análisis e indexado. Un worker por conversación abierta: cancelar una importación
 * es simplemente terminarlo. Mantiene el índice de búsqueda para responder sin tocar el hilo principal.
 */
const ctx = self as unknown as {
  postMessage(msg: WorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
};
const engine = new ChatEngine();

ctx.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'parse') {
    let lastPost = 0;
    try {
      const result = await engine.parse(msg.source, msg.dateOrder, (ratio) => {
        const now = performance.now();
        if (ratio >= 1 || now - lastPost > 60) {
          lastPost = now;
          ctx.postMessage({ type: 'progress', jobId: msg.jobId, ratio });
        }
      });
      ctx.postMessage({ type: 'parsed', jobId: msg.jobId, result });
      // Con el chat ya entregado, se calculan las estadísticas en segundo plano.
      setTimeout(() => engine.stats(), 0);
    } catch (err) {
      const code = err instanceof ImportError ? err.code : (err as Error).message === 'cancelled' ? 'cancelled' : err instanceof RangeError ? 'memory' : 'unknown';
      ctx.postMessage({ type: 'parse-error', jobId: msg.jobId, code, ...(err instanceof ImportError && err.detail ? { detail: err.detail } : {}) });
    }
  } else if (msg.type === 'search') {
    const hits = engine.search(msg.query);
    ctx.postMessage({ type: 'searched', reqId: msg.reqId, hits }, [hits.buffer]);
  } else if (msg.type === 'stats') {
    ctx.postMessage({ type: 'stats', reqId: msg.reqId, stats: engine.stats() });
  } else if (msg.type === 'dispose') {
    engine.dispose();
  }
};
