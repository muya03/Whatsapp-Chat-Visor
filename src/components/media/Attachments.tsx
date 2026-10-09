import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { dimsCache, downloadBlob } from '../../features/media/mediaUtils';
import { useMediaUrl } from '../../features/media/useMediaUrl';
import { useWaveform } from '../../features/media/useWaveform';
import { extensionOf } from '../../parser/whatsapp/attachmentParser';
import { LIMITS } from '../../services/limits';
import type { AttachmentRef } from '../../parser/whatsapp/types';
import type { MediaFile } from '../../services/zipReader';
import { formatBytes, formatDuration } from '../../utils/format';
import { Icon, type IconName } from '../Icon';
import { useMediaCtx } from './MediaContext';
import { useToast } from '../layout/Toast';

interface AttProps {
  att: AttachmentRef;
  msgId: number;
  attIndex: number;
}

/** Elige la representación de un adjunto; si no hay archivo, siempre hay un fallback útil (nunca imagen rota). */
export const Attachment = memo(function Attachment({ att, msgId, attIndex }: AttProps) {
  const { media, hasZip } = useMediaCtx();
  const file = useMemo(() => media.resolve(att.fileName), [media, att.fileName]);
  if (att.omitted) return <PlaceholderCard kind={att.kind} title="Contenido multimedia omitido" sub="La exportación se hizo sin archivos adjuntos." icon={iconFor(att.kind)} />;
  if (!file)
    return (
      <PlaceholderCard
        kind={att.kind}
        title={att.fileName ?? 'Archivo'}
        sub={hasZip ? 'Archivo no incluido en el ZIP exportado' : 'Archivo no disponible (solo se importó el texto)'}
        icon={iconFor(att.kind)}
        missing
      />
    );
  switch (att.kind) {
    case 'image':
    case 'sticker':
      return <ImageAttachment att={att} file={file} msgId={msgId} attIndex={attIndex} />;
    case 'video':
    case 'gif':
      return <VideoAttachment file={file} msgId={msgId} attIndex={attIndex} />;
    case 'audio':
    case 'voice':
      return <AudioAttachment file={file} voice={att.kind === 'voice'} />;
    case 'contact':
      return <ContactCard file={file} />;
    default:
      return <DocumentCard file={file} kind={att.kind} />;
  }
});

function iconFor(kind: AttachmentRef['kind']): IconName {
  switch (kind) {
    case 'image':
    case 'sticker':
    case 'gif':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
    case 'voice':
      return 'mic';
    case 'contact':
      return 'person';
    case 'archive':
      return 'zip';
    default:
      return 'doc';
  }
}

/* ---------------------------------- Imagen ---------------------------------- */

const ImageAttachment = memo(function ImageAttachment({ att, file, msgId, attIndex }: { att: AttachmentRef; file: MediaFile; msgId: number; attIndex: number }) {
  const { store, openViewer } = useMediaCtx();
  const heavy = file.size > LIMITS.autoLoadMaxBytes.image;
  const [go, setGo] = useState(!heavy);
  const state = useMediaUrl(store, go ? file : null);
  const cache = dimsCache(store);
  const [dims, setDims] = useState(() => cache.get(file.key) ?? null);
  const [broken, setBroken] = useState(false);
  const sticker = att.kind === 'sticker';

  if (!go) return <HeavyGate icon="image" label="Imagen" file={file} onLoad={() => setGo(true)} />;
  if (state.status === 'error' || broken) {
    return <DocumentCard file={file} kind="image" note={broken ? 'Tu navegador no puede mostrar este formato de imagen.' : errorNote(file, 'la imagen')} />;
  }
  const style = (dims ? { '--ratio': dims.w / dims.h } : undefined) as CSSProperties | undefined;
  return (
    <button
      type="button"
      className={`media media--button${sticker ? ' media--sticker' : ''}`}
      style={dims && !sticker ? { ...style, width: 'min(var(--media-max-w), calc(var(--media-max-h) * var(--ratio)))' } : undefined}
      onClick={() => state.status === 'ready' && openViewer(msgId, attIndex)}
      aria-label={`Abrir ${sticker ? 'sticker' : 'imagen'} ${file.name}`}
    >
      {state.status === 'ready' ? (
        <img
          className="media__img"
          src={state.url}
          alt={sticker ? 'Sticker' : file.name}
          draggable={false}
          style={dims ? { aspectRatio: `${dims.w} / ${dims.h}` } : undefined}
          onLoad={(e) => {
            const im = e.currentTarget;
            if (im.naturalWidth > 0 && !cache.has(file.key)) {
              const d = { w: im.naturalWidth, h: im.naturalHeight };
              cache.set(file.key, d);
              setDims(d);
            }
          }}
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="media__ph" style={dims ? { aspectRatio: `${dims.w} / ${dims.h}` } : undefined}>
          <div className="spinner" role="progressbar" aria-label="Cargando imagen" />
        </div>
      )}
    </button>
  );
});

/* ---------------------------------- Vídeo ---------------------------------- */

const VideoAttachment = memo(function VideoAttachment({ file, msgId, attIndex }: { file: MediaFile; msgId: number; attIndex: number }) {
  const { store, openViewer } = useMediaCtx();
  const heavy = file.size > LIMITS.autoLoadMaxBytes.video;
  const [go, setGo] = useState(!heavy);
  const state = useMediaUrl(store, go ? file : null);
  const cache = dimsCache(store);
  const [dims, setDims] = useState(() => cache.get(file.key) ?? null);
  const [duration, setDuration] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  if (!go) return <HeavyGate icon="video" label="Vídeo" file={file} onLoad={() => setGo(true)} />;
  if (state.status === 'error' || failed) {
    return <DocumentCard file={file} kind="video" note={failed ? 'Tu navegador no puede reproducir este formato de vídeo. Puedes descargarlo.' : errorNote(file, 'el vídeo')} />;
  }
  return (
    <button
      type="button"
      className="media media--button"
      style={dims ? ({ '--ratio': dims.w / dims.h, width: 'min(var(--media-max-w), calc(var(--media-max-h) * var(--ratio)))' } as CSSProperties) : undefined}
      onClick={() => state.status === 'ready' && openViewer(msgId, attIndex)}
      aria-label={`Reproducir vídeo ${file.name}`}
    >
      {state.status === 'ready' ? (
        <video
          src={`${state.url}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          tabIndex={-1}
          style={{ pointerEvents: 'none', aspectRatio: dims ? `${dims.w} / ${dims.h}` : '16 / 9' }}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth > 0 && !cache.has(file.key)) {
              const d = { w: v.videoWidth, h: v.videoHeight };
              cache.set(file.key, d);
              setDims(d);
            }
            if (Number.isFinite(v.duration)) setDuration(v.duration);
          }}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="media__ph" style={{ aspectRatio: dims ? `${dims.w} / ${dims.h}` : '16 / 9' }}>
          <div className="spinner" role="progressbar" aria-label="Cargando vídeo" />
        </div>
      )}
      {state.status === 'ready' && (
        <>
          <span className="media__play">
            <span>
              <Icon name="play" />
            </span>
          </span>
          {duration !== null && (
            <span className="media__dur">
              <Icon name="video" />
              {formatDuration(duration)}
            </span>
          )}
        </>
      )}
    </button>
  );
});

/* ---------------------------------- Audio ---------------------------------- */

let currentAudio: HTMLAudioElement | null = null;

const AudioAttachment = memo(function AudioAttachment({ file, voice }: { file: MediaFile; voice: boolean }) {
  const { store } = useMediaCtx();
  const heavy = file.size > LIMITS.autoLoadMaxBytes.audio;
  const [go, setGo] = useState(!heavy);
  const state = useMediaUrl(store, go ? file : null);
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const peaks = useWaveform(state.status === 'ready' ? state.blob : null);

  useEffect(() => {
    const a = ref.current;
    return () => {
      if (a && currentAudio === a) currentAudio = null;
    };
  }, []);

  if (!go) return <HeavyGate icon="mic" label="Audio" file={file} onLoad={() => setGo(true)} />;
  if (state.status === 'error' || failed) {
    return <DocumentCard file={file} kind="audio" note={failed ? 'Tu navegador no puede reproducir este formato de audio. Puedes descargarlo.' : errorNote(file, 'el audio')} />;
  }
  const ready = state.status === 'ready';
  const progress = duration && duration > 0 ? Math.min(1, time / duration) : 0;
  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) {
      if (currentAudio && currentAudio !== a) currentAudio.pause();
      currentAudio = a;
      a.play().catch(() => setFailed(true));
    } else a.pause();
  };
  const shown = playing || time > 0 ? Math.max(0, (duration ?? 0) - time) : (duration ?? 0);

  return (
    <div className="audio" role="group" aria-label={voice ? 'Nota de voz' : `Audio ${file.name}`}>
      {ready && (
        <audio
          ref={ref}
          src={state.url}
          preload="metadata"
          onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setTime(0);
          }}
          onError={() => setFailed(true)}
        />
      )}
      <button type="button" className="audio__play" onClick={toggle} disabled={!ready} aria-label={playing ? 'Pausar' : 'Reproducir'}>
        {ready ? <Icon name={playing ? 'pause' : 'play'} /> : <div className="spinner" style={{ width: 22, height: 22, borderWidth: 2 }} role="progressbar" aria-label="Cargando audio" />}
      </button>
      <div className="audio__track">
        {peaks ? (
          <div className="audio__wave" aria-hidden="true">
            {peaks.map((p, i) => (
              <i key={i} className={i / peaks.length < progress ? 'is-played' : undefined} style={{ height: `${Math.round(p * 100)}%` }} />
            ))}
          </div>
        ) : (
          <div className="audio__line" aria-hidden="true">
            <b style={{ width: `${progress * 100}%` }} />
            <span className="audio__knob" style={{ left: `${progress * 100}%` }} />
          </div>
        )}
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          aria-label="Posición de reproducción"
          disabled={!ready || !duration}
          onChange={(e) => {
            const a = ref.current;
            if (a && duration) {
              a.currentTime = (Number(e.target.value) / 1000) * duration;
              setTime(a.currentTime);
            }
          }}
        />
      </div>
      <span className="audio__time">{duration !== null ? formatDuration(shown) : ''}</span>
    </div>
  );
});

/* ---------------------------- Documentos y tarjetas ---------------------------- */

/** Mensaje de error de lectura; distingue el caso «demasiado grande» del resto. */
function errorNote(file: MediaFile, what: string): string {
  return file.size > LIMITS.maxMediaBytes
    ? `${formatBytes(file.size)}: demasiado grande para abrirlo en el navegador (límite ${formatBytes(LIMITS.maxMediaBytes)}).`
    : `No se pudo leer ${what} del ZIP.`;
}

/** Adjunto pesado: no se descomprime solo al hacer scroll; se carga cuando el usuario lo pide. */
function HeavyGate({ icon, label, file, onLoad }: { icon: IconName; label: string; file: MediaFile; onLoad(): void }) {
  return (
    <button type="button" className="media media--button" onClick={onLoad} aria-label={`Cargar ${label.toLowerCase()} de ${formatBytes(file.size)}: ${file.name}`}>
      <div className="media__ph">
        <Icon name={icon} />
        <span>
          {label} de {formatBytes(file.size)}
        </span>
        <small>Toca para cargar</small>
      </div>
    </button>
  );
}

function docClass(ext: string): { cls: string; label: string } {
  if (ext === 'pdf') return { cls: 'ic-pdf', label: 'PDF' };
  if (/^docx?$|^odt$|^rtf$/.test(ext)) return { cls: 'ic-doc', label: ext };
  if (/^xlsx?$|^ods$|^csv$/.test(ext)) return { cls: 'ic-xls', label: ext };
  if (/^pptx?$|^odp$/.test(ext)) return { cls: 'ic-ppt', label: ext };
  if (/^(zip|rar|7z|tar|gz|tgz)$/.test(ext)) return { cls: 'ic-zip', label: ext };
  if (/^(txt|md)$/.test(ext)) return { cls: 'ic-txt', label: ext };
  return { cls: 'ic-gen', label: ext.slice(0, 4) || 'file' };
}

function useDownload(file: MediaFile) {
  const { store } = useMediaCtx();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (openInTab = false) => {
    setBusy(true);
    try {
      const blob = await store.getBlob(file);
      if (openInTab) {
        const url = URL.createObjectURL(blob);
        const w = window.open(url, '_blank', 'noopener');
        if (!w) downloadBlob(blob, file.name);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else downloadBlob(blob, file.name);
    } catch {
      toast('No se pudo leer el archivo del ZIP.');
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}

const DocumentCard = memo(function DocumentCard({ file, kind, note }: { file: MediaFile; kind: AttachmentRef['kind']; note?: string }) {
  const ext = extensionOf(file.name);
  const { cls, label } = docClass(ext);
  const { run, busy } = useDownload(file);
  const sub = [note, ext ? ext.toUpperCase() : null, formatBytes(file.size)].filter(Boolean).join(' · ');
  return (
    <div className="card" role="group" aria-label={`Archivo ${file.name}`}>
      <span className={`card__icon ${cls}`} aria-hidden="true">
        {kind === 'archive' ? <Icon name="zip" size={22} /> : <Icon name="doc" size={22} />}
        <span>{label}</span>
      </span>
      <span className="card__text">
        <span className="card__name" dir="auto">
          {file.name}
        </span>
        <span className="card__sub">{sub}</span>
      </span>
      {ext === 'pdf' && (
        <button type="button" className="icon-btn card__action" onClick={() => run(true)} disabled={busy} aria-label={`Abrir ${file.name}`} title="Abrir">
          <Icon name="open" />
        </button>
      )}
      <button type="button" className="icon-btn card__action" onClick={() => run(false)} disabled={busy} aria-label={`Descargar ${file.name}`} title="Descargar">
        {busy ? <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /> : <Icon name="download" />}
      </button>
    </div>
  );
});

function PlaceholderCard({ kind, title, sub, icon, missing }: { kind: AttachmentRef['kind']; title: string; sub: string; icon: IconName; missing?: boolean }) {
  void kind;
  return (
    <div className={`card${missing ? ' card--missing' : ''}`} role="group" aria-label={title}>
      <span className="card__icon ic-gen" aria-hidden="true">
        <Icon name={missing ? 'block' : icon} size={24} />
      </span>
      <span className="card__text">
        <span className="card__name" dir="auto">
          {title}
        </span>
        <span className="card__sub">{sub}</span>
      </span>
    </div>
  );
}

const ContactCard = memo(function ContactCard({ file }: { file: MediaFile }) {
  const { store } = useMediaCtx();
  const [info, setInfo] = useState<{ name: string; phone: string } | null>(null);
  const { run, busy } = useDownload(file);
  useEffect(() => {
    let cancelled = false;
    // Los .vcf son diminutos: se leen directamente del ZIP para mostrar el nombre real de la tarjeta.
    file
      .load()
      .then((b) => b.text())
      .then((t) => {
        if (cancelled) return;
        const name = /^FN[^:]*:(.+)$/im.exec(t)?.[1]?.trim() ?? '';
        const phone = /^TEL[^:]*:(.+)$/im.exec(t)?.[1]?.trim() ?? '';
        setInfo({ name, phone });
      })
      .catch(() => undefined);
    void store;
    return () => {
      cancelled = true;
    };
  }, [file, store]);
  return (
    <div className="card" role="group" aria-label="Tarjeta de contacto">
      <span className="card__icon ic-contact" aria-hidden="true">
        <Icon name="person" size={26} />
      </span>
      <span className="card__text">
        <span className="card__name" dir="auto">
          {info?.name || file.name}
        </span>
        <span className="card__sub">{info?.phone || 'Tarjeta de contacto'}</span>
      </span>
      <button type="button" className="icon-btn card__action" onClick={() => run(false)} disabled={busy} aria-label="Descargar tarjeta de contacto" title="Descargar">
        <Icon name="download" />
      </button>
    </div>
  );
});
