import { useEffect, useState } from 'react';
import type { MediaStore } from '../../services/mediaStore';
import type { MediaFile } from '../../services/zipReader';

export type MediaState =
  | { status: 'loading' }
  | { status: 'ready'; url: string; blob: Blob }
  | { status: 'error' };

/**
 * Descomprime el adjunto cuando su fila está montada (la virtualización ya limita cuántas hay)
 * y libera la referencia al desmontarse. Un pequeño retardo evita descomprimir lo que el usuario
 * solo cruza al hacer scroll rápido.
 */
export function useMediaUrl(store: MediaStore, file: MediaFile | null, delayMs = 90): MediaState {
  const [state, setState] = useState<MediaState>({ status: 'loading' });
  const key = file?.key;
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let started = false;
    setState({ status: 'loading' });
    const timer = setTimeout(() => {
      started = true;
      store.acquire(file).then(
        (h) => {
          if (!cancelled) setState({ status: 'ready', url: h.url, blob: h.blob });
        },
        () => {
          if (!cancelled) setState({ status: 'error' });
        },
      );
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (started) store.release(file);
    };
    // `file` se identifica por su clave: resolve() devuelve objetos nuevos con el mismo contenido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, key, delayMs]);
  return state;
}
