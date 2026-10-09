import { useEffect, useState } from 'react';
import type { Session } from '../../app/state/store';
import { downloadBlob, type ViewableItem } from '../../features/media/mediaUtils';
import { useMediaUrl } from '../../features/media/useMediaUrl';
import { useEscape } from '../../app/state/hooks';
import { formatDateLong } from '../../utils/format';
import { Icon } from '../Icon';

interface Props {
  session: Session;
  items: ViewableItem[];
  index: number;
  onIndex(i: number): void;
  onClose(): void;
  onShowInChat(msgId: number): void;
}

/** Visor a pantalla completa. Cerrarlo (botón, Escape o «Atrás») devuelve la conversación tal cual estaba. */
export function MediaViewer({ session, items, index, onIndex, onClose, onShowInChat }: Props) {
  const item = items[index];
  const { mediaStore: store } = session.imported;
  const state = useMediaUrl(store, item?.file ?? null, 0);
  const [zoom, setZoom] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  useEscape(onClose);

  useEffect(() => {
    setZoom(false);
    setMediaFailed(false);
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onIndex]);

  // Precarga el vecino siguiente para que el avance sea fluido (se libera sola al cambiar).
  const neighbor = items[index + 1] ?? null;
  useMediaUrl(store, neighbor && neighbor.att.kind === 'image' ? neighbor.file : null, 250);

  if (!item) return null;
  const msg = session.chat.messages[item.msgId];
  const isVideo = item.att.kind === 'video' || item.att.kind === 'gif';
  const download = async () => downloadBlob(await store.getBlob(item.file), item.file.name);

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`Visor de ${isVideo ? 'vídeo' : 'imagen'}`}>
      <div className="viewer__bar">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar visor" data-autofocus ref={(el) => el?.focus({ preventScroll: true })}>
          <Icon name="back" />
        </button>
        <div className="viewer__who">
          <b dir="auto">{msg?.sender ?? item.file.name}</b>
          <span>{msg?.dayKey ? formatDateLong(msg.dayKey) : ''} · {index + 1} / {items.length}</span>
        </div>
        <button type="button" className="icon-btn" onClick={() => onShowInChat(item.msgId)} aria-label="Ver en la conversación" title="Ver en la conversación">
          <Icon name="chat" />
        </button>
        <button type="button" className="icon-btn" onClick={download} aria-label="Descargar" title="Descargar">
          <Icon name="download" />
        </button>
      </div>
      <div className="viewer__stage">
        {state.status === 'loading' && <div className="spinner" role="progressbar" aria-label="Cargando" />}
        {(state.status === 'error' || mediaFailed) && (
          <div className="viewer__msg" role="alert">
            <Icon name="warn" />
            <p>{mediaFailed ? 'Tu navegador no puede mostrar este archivo. Puedes descargarlo.' : 'No se pudo leer el archivo del ZIP.'}</p>
            <button type="button" className="btn btn--outline" style={{ color: '#fff' }} onClick={download}>Descargar</button>
          </div>
        )}
        {state.status === 'ready' && !mediaFailed &&
          (isVideo ? (
            <video key={item.file.key} src={state.url} controls autoPlay playsInline onError={() => setMediaFailed(true)} />
          ) : (
            <img
              key={item.file.key}
              className="viewer__img"
              data-zoom={zoom}
              src={state.url}
              alt={item.file.name}
              draggable={false}
              onClick={() => setZoom((z) => !z)}
              onError={() => setMediaFailed(true)}
            />
          ))}
        {index > 0 && (
          <button type="button" className="viewer__nav viewer__nav--prev" onClick={() => onIndex(index - 1)} aria-label="Anterior">
            <Icon name="left" size={28} />
          </button>
        )}
        {index < items.length - 1 && (
          <button type="button" className="viewer__nav viewer__nav--next" onClick={() => onIndex(index + 1)} aria-label="Siguiente">
            <Icon name="right" size={28} />
          </button>
        )}
      </div>
      {msg?.text && <div className="viewer__caption" dir="auto">{msg.text}</div>}
    </div>
  );
}
