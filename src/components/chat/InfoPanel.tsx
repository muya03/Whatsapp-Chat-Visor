import { useMemo, useState } from 'react';
import { useApp, type Session } from '../../app/state/store';
import { conversationSubtitle } from '../../features/conversation/title';
import { collectDocuments, collectViewable, type ViewableItem } from '../../features/media/mediaUtils';
import { useMediaUrl } from '../../features/media/useMediaUrl';
import { es } from '../../i18n/es';
import type { ChatStats } from '../../parser/whatsapp/types';
import { formatBytes, formatDateLong, formatDateShort, formatMonth } from '../../utils/format';
import { Icon } from '../Icon';
import { Avatar } from '../layout/Avatar';

interface Props {
  session: Session;
  title: string;
  onClose(): void;
  onWhoAmI(): void;
  onSettings(): void;
  onOpenMedia(item: ViewableItem): void;
  onGoToMessage(id: number): void;
  onSave?: (() => void) | undefined;
}

type Tab = 'media' | 'docs' | 'stats';

function Thumb({ item, store, onOpen }: { item: ViewableItem; store: Session['imported']['mediaStore']; onOpen(): void }) {
  const isImage = item.att.kind === 'image' || item.att.kind === 'sticker';
  const state = useMediaUrl(store, isImage ? item.file : null, 120);
  return (
    <button type="button" className="media-grid__cell" onClick={onOpen} aria-label={`Abrir ${item.file.name}`}>
      {isImage && state.status === 'ready' && <img src={state.url} alt="" loading="lazy" draggable={false} />}
      {isImage && state.status === 'loading' && <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />}
      {(!isImage || state.status === 'error') && <Icon name={isImage ? 'image' : 'video'} size={30} />}
      {!isImage && (
        <span style={{ position: 'absolute', right: 4, bottom: 4, color: 'var(--c-text-2)' }}>
          <Icon name="play" size={18} />
        </span>
      )}
    </button>
  );
}

export function InfoPanel({ session, title, onClose, onWhoAmI, onSettings, onOpenMedia, onGoToMessage, onSave }: Props) {
  const { patchSession } = useApp();
  const { chat, imported, stats } = session;
  const [tab, setTab] = useState<Tab>('media');
  const [limit, setLimit] = useState(60);
  const media = useMemo(() => collectViewable(chat.messages, imported.media), [chat.messages, imported.media]);
  const docs = useMemo(() => collectDocuments(chat.messages, imported.media), [chat.messages, imported.media]);
  const omitted = useMemo(() => chat.messages.reduce((n, m) => n + m.attachments.filter((a) => a.omitted).length, 0), [chat.messages]);
  const missing = useMemo(() => chat.messages.reduce((n, m) => n + m.attachments.filter((a) => !a.omitted && imported.media.resolve(a.fileName) === null).length, 0), [chat.messages, imported.media]);
  const sub = conversationSubtitle(chat, stats, formatDateShort, es.messagesCount);
  void sub;
  const first = stats?.firstDay ?? chat.messages.find((m) => m.dayKey !== null)?.dayKey ?? null;
  const last = stats?.lastDay ?? [...chat.messages].reverse().find((m) => m.dayKey !== null)?.dayKey ?? null;
  const total = stats?.messageCount ?? chat.messages.filter((m) => m.kind !== 'system').length;

  return (
    <aside className="drawer" aria-label={es.info}>
      <header className="hdr">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar panel de datos">
          <Icon name="close" className="info-close" />
        </button>
        <span className="hdr__title">{es.info}</span>
      </header>
      <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
        <div className="panel-hero">
          <Avatar size={160} group={chat.isGroup} src={session.avatarUrl} label={title} />
          <h2 dir="auto" style={{ overflowWrap: 'anywhere' }}>{title}</h2>
          <p>{chat.isGroup ? es.participantsCount(chat.participants.length) : 'Chat individual'} · {es.messagesCount(total)}</p>
          <button type="button" className="btn btn--outline" onClick={onSettings}>Editar nombre y ajustes</button>
        </div>

        <section className="panel-section">
          <h3>Resumen</h3>
          <div className="kv"><span>Archivo</span><span dir="auto" style={{ textAlign: 'end', overflowWrap: 'anywhere' }}>{imported.fileName}</span></div>
          <div className="kv"><span>Tamaño</span><span>{formatBytes(imported.fileSize)}</span></div>
          <div className="kv"><span>Origen</span><span>{chat.platform === 'ios' ? 'iPhone' : chat.platform === 'android' ? 'Android' : 'Desconocido'}</span></div>
          {first && last && <div className="kv"><span>Periodo</span><span style={{ textAlign: 'end' }}>{formatDateLong(first)} – {formatDateLong(last)}</span></div>}
          <div className="kv"><span>Adjuntos disponibles</span><span>{(media.length + docs.length).toLocaleString('es')}</span></div>
          {omitted > 0 && <div className="kv"><span>Omitidos al exportar</span><span>{omitted.toLocaleString('es')}</span></div>}
          {missing > 0 && <div className="kv"><span>No incluidos en el ZIP</span><span>{missing.toLocaleString('es')}</span></div>}
          {chat.recoveredLines > 0 && <div className="kv"><span>Líneas recuperadas</span><span>{chat.recoveredLines.toLocaleString('es')}</span></div>}
        </section>

        <section className="panel-section">
          <h3>Yo soy</h3>
          <button type="button" className="person" onClick={onWhoAmI}>
            <Avatar size={40} />
            <span className="person__name" dir="auto">{session.me ?? 'Sin indicar (vista neutral)'}</span>
            <span className="person__count" style={{ color: 'var(--c-accent-strong)' }}>Cambiar</span>
          </button>
        </section>

        <section className="panel-section">
          <h3>{es.participantsCount(chat.participants.length)}</h3>
          <ul>
            {chat.participants.map((p) => (
              <li key={p.name}>
                <button type="button" className="person" onClick={() => patchSession(session.id, { me: p.name })} title="Marcar como «yo»">
                  <Avatar size={40} />
                  <span className="person__name" dir="auto">{p.name}</span>
                  {session.me === p.name && <span className="person__me">{es.you}</span>}
                  <span className="person__count">{p.count.toLocaleString('es')}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {onSave && (
          <section className="panel-section">
            <h3>Almacenamiento</h3>
            <button type="button" className="btn btn--outline" onClick={onSave}>Guardar esta conversación en el dispositivo</button>
          </section>
        )}

        <section className="panel-section" style={{ padding: 0 }}>
          <div className="tabs" role="tablist" aria-label="Contenido de la conversación">
            {(['media', 'docs', 'stats'] as Tab[]).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                {t === 'media' ? `Multimedia (${media.length})` : t === 'docs' ? `Documentos (${docs.length})` : 'Estadísticas'}
              </button>
            ))}
          </div>
          <div role="tabpanel" style={{ padding: '10px 14px 18px' }}>
            {tab === 'media' &&
              (media.length === 0 ? (
                <p className="empty-note">No hay imágenes ni vídeos en esta importación.{imported.sourceKind === 'txt' ? ' Importa el ZIP exportado con multimedia para verlos.' : ''}</p>
              ) : (
                <>
                  <div className="media-grid">
                    {media.slice(0, limit).map((it, i) => (
                      <Thumb key={`${it.msgId}-${i}`} item={it} store={imported.mediaStore} onOpen={() => onOpenMedia(it)} />
                    ))}
                  </div>
                  {media.length > limit && (
                    <div style={{ textAlign: 'center', marginTop: 10 }}>
                      <button type="button" className="btn btn--ghost" onClick={() => setLimit((l) => l + 90)}>Mostrar más ({(media.length - limit).toLocaleString('es')})</button>
                    </div>
                  )}
                </>
              ))}
            {tab === 'docs' &&
              (docs.length === 0 ? (
                <p className="empty-note">No hay documentos en esta importación.</p>
              ) : (
                <div className="list-rows">
                  {docs.slice(0, limit).map((d, i) => (
                    <button key={`${d.msgId}-${i}`} type="button" className="list-row" onClick={() => onGoToMessage(d.msgId)}>
                      <span dir="auto">{d.file.name}<small>{formatBytes(d.file.size)}</small></span>
                      <Icon name="right" size={20} />
                    </button>
                  ))}
                  {docs.length > limit && <button type="button" className="btn btn--ghost" onClick={() => setLimit((l) => l + 90)}>Mostrar más</button>}
                </div>
              ))}
            {tab === 'stats' && <StatsView stats={stats} />}
          </div>
        </section>
      </div>
    </aside>
  );
}

function StatsView({ stats }: { stats: ChatStats | null }) {
  if (!stats) return <p className="empty-note">Calculando estadísticas…</p>;
  const maxP = Math.max(1, ...stats.perParticipant.map((p) => p.count));
  const maxH = Math.max(1, ...stats.perHour);
  const months = stats.perMonth;
  const maxM = Math.max(1, ...months.map(([, n]) => n));
  const mediaEntries = Object.entries(stats.media) as [string, number][];
  const LABEL: Record<string, string> = { image: 'Imágenes', video: 'Vídeos', gif: 'GIF', audio: 'Audios', voice: 'Notas de voz', sticker: 'Stickers', document: 'Documentos', contact: 'Contactos', archive: 'Archivos comprimidos', unknown: 'Otros' };
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <p style={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
        Datos calculados solo con los mensajes de esta exportación. {stats.messageCount.toLocaleString('es')} mensajes y {stats.systemCount.toLocaleString('es')} avisos del sistema.
      </p>
      <div>
        <h3 style={{ fontSize: 13, color: 'var(--c-text-2)', marginBottom: 6, fontWeight: 400 }}>Mensajes por participante</h3>
        <div className="bars">
          {stats.perParticipant.slice(0, 10).map((p) => (
            <div className="bar" key={p.name}>
              <span className="truncate" dir="auto">{p.name}</span>
              <span className="bar__track"><span className="bar__fill" style={{ width: `${(p.count / maxP) * 100}%`, display: 'block' }} /></span>
              <span>{p.count.toLocaleString('es')}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 style={{ fontSize: 13, color: 'var(--c-text-2)', marginBottom: 6, fontWeight: 400 }}>Actividad por hora del día</h3>
        <div className="hours" role="img" aria-label="Mensajes por hora">
          {stats.perHour.map((n, h) => (
            <i key={h} title={`${h}:00 — ${n.toLocaleString('es')}`} style={{ height: `${Math.max(2, (n / maxH) * 100)}%` }} />
          ))}
        </div>
        <div className="hours-axis"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>23 h</span></div>
      </div>
      {months.length > 1 && (
        <div>
          <h3 style={{ fontSize: 13, color: 'var(--c-text-2)', marginBottom: 6, fontWeight: 400 }}>Mensajes por mes</h3>
          <div className="bars">
            {months.slice(-12).map(([ym, n]) => (
              <div className="bar" key={ym}>
                <span>{formatMonth(Math.floor(ym / 100), (ym % 100) - 1)}</span>
                <span className="bar__track"><span className="bar__fill" style={{ width: `${(n / maxM) * 100}%`, display: 'block' }} /></span>
                <span>{n.toLocaleString('es')}</span>
              </div>
            ))}
          </div>
          {months.length > 12 && <p style={{ fontSize: 12, color: 'var(--c-text-2)', marginTop: 6 }}>Se muestran los últimos 12 meses de {months.length}.</p>}
        </div>
      )}
      {mediaEntries.length > 0 && (
        <div>
          <h3 style={{ fontSize: 13, color: 'var(--c-text-2)', marginBottom: 6, fontWeight: 400 }}>Archivos adjuntos ({stats.attachmentsTotal.toLocaleString('es')})</h3>
          <div className="chips">{mediaEntries.map(([k, n]) => <span key={k}>{LABEL[k] ?? k}: {n.toLocaleString('es')}</span>)}</div>
        </div>
      )}
      {stats.topEmojis.length > 0 && (
        <div>
          <h3 style={{ fontSize: 13, color: 'var(--c-text-2)', marginBottom: 6, fontWeight: 400 }}>Emojis más usados</h3>
          <div className="chips">{stats.topEmojis.map((e) => <span key={e.emoji}>{e.emoji} {e.count.toLocaleString('es')}</span>)}</div>
        </div>
      )}
      {stats.topWords.length > 0 && (
        <div>
          <h3 style={{ fontSize: 13, color: 'var(--c-text-2)', marginBottom: 6, fontWeight: 400 }}>Palabras más frecuentes (4+ letras)</h3>
          <div className="chips">{stats.topWords.map((w) => <span key={w.word} dir="auto">{w.word} {w.count.toLocaleString('es')}</span>)}</div>
        </div>
      )}
    </div>
  );
}
