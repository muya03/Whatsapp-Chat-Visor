import { createContext, useContext } from 'react';
import type { MediaStore } from '../../services/mediaStore';
import type { MediaIndex } from '../../services/zipReader';

export interface MediaCtxValue {
  media: MediaIndex;
  store: MediaStore;
  /** Abre el visor a pantalla completa en el adjunto indicado. */
  openViewer(msgId: number, attIndex: number): void;
  /** Pausa cualquier otro audio/vídeo al iniciar uno. */
  hasZip: boolean;
}

export const MediaCtx = createContext<MediaCtxValue | null>(null);

export function useMediaCtx(): MediaCtxValue {
  const v = useContext(MediaCtx);
  if (!v) throw new Error('MediaCtx ausente');
  return v;
}
