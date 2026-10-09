import { memo, useMemo } from 'react';
import { isMissedCall } from '../../parser/whatsapp/systemMessages';
import { emojiOnlyCount } from '../../parser/whatsapp/richText';
import type { ChatMessage } from '../../parser/whatsapp/types';
import { formatTime, senderColorIndex, type TimeFormat } from '../../utils/format';
import { Icon } from '../Icon';
import { Attachment } from '../media/Attachments';
import { useMediaCtx } from '../media/MediaContext';
import { RichText } from './RichText';

export type Side = 'in' | 'out';

export interface BubbleProps {
  msg: ChatMessage;
  side: Side;
  first: boolean;
  showName: boolean;
  timeFormat: TimeFormat;
  sourceHour12: boolean;
  hlQuery: string;
  hlCurrent: boolean;
  flash: boolean;
}

const VISUAL = new Set(['image', 'video', 'gif', 'sticker']);

export const Bubble = memo(function Bubble({ msg, side, first, showName, timeFormat, sourceHour12, hlQuery, hlCurrent, flash }: BubbleProps) {
  const { media } = useMediaCtx();
  const time = formatTime(msg.ts, msg.rawTime, timeFormat, sourceHour12);

  const visual = useMemo(() => {
    if (msg.attachments.length === 0) return { all: false, sticker: false };
    const ready = msg.attachments.map((a) => !a.omitted && VISUAL.has(a.kind) && media.resolve(a.fileName) !== null);
    return { all: ready.every(Boolean), sticker: ready.every(Boolean) && msg.attachments.every((a) => a.kind === 'sticker') };
  }, [msg.attachments, media]);

  const emojiCount = msg.kind === 'text' ? emojiOnlyCount(msg.text) : 0;
  const jumbo = emojiCount >= 1 && emojiCount <= 3;
  const hasText = msg.text.length > 0 && msg.kind !== 'location';
  const mediaOnly = visual.all && !hasText;
  const sticker = visual.sticker && !hasText;

  const cls = [
    'bubble',
    `bubble--${side}`,
    first && !sticker && !jumbo ? 'bubble--tail' : '',
    sticker ? 'bubble--sticker' : mediaOnly ? 'bubble--media-only' : visual.all ? 'bubble--captioned' : '',
    jumbo ? 'bubble--emoji' : '',
    msg.kind === 'deleted' ? 'bubble--deleted' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const style = showName && msg.sender ? ({ '--sender-color': `var(--sender-${senderColorIndex(msg.sender)})` } as React.CSSProperties) : undefined;

  return (
    <div className={cls} data-msg={msg.id} data-flash={flash || undefined} style={style}>
      {showName && msg.sender && (
        <div className="bubble__sender truncate" dir="auto">
          {msg.sender}
        </div>
      )}

      {msg.attachments.map((a, i) => (
        <Attachment key={i} att={a} msgId={msg.id} attIndex={i} />
      ))}

      {msg.kind === 'location' && msg.locationUrl && (
        <div className="card" role="group" aria-label="Ubicación">
          <span className="card__icon ic-loc" aria-hidden="true">
            <Icon name="pin" size={26} />
          </span>
          <span className="card__text">
            <span className="card__name">Ubicación compartida</span>
            <a className="card__sub" href={msg.locationUrl} target="_blank" rel="noopener noreferrer nofollow">
              Ver en el mapa
            </a>
          </span>
        </div>
      )}

      {msg.kind === 'call' && (
        <div className="bubble__text" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="call" size={18} style={{ color: isMissedCall(msg.text) ? 'var(--c-danger)' : 'var(--c-accent-strong)' }} />
          <span dir="auto">{msg.text}</span>
          <span className="bubble__spacer" aria-hidden="true" />
        </div>
      )}

      {msg.kind === 'deleted' && (
        <div className="bubble__text">
          <Icon name="block" />
          <span dir="auto">{msg.text}</span>
          <span className="bubble__spacer" aria-hidden="true" />
        </div>
      )}

      {hasText && msg.kind !== 'call' && msg.kind !== 'deleted' && (
        <div className={`bubble__text${jumbo ? ' bubble__text--jumbo' : ''}`} dir="auto">
          <RichText text={msg.text} query={hlQuery} current={hlCurrent} />
          {!jumbo && <span className="bubble__spacer" aria-hidden="true" />}
        </div>
      )}

      {!hasText && !visual.all && msg.attachments.length > 0 && <div style={{ height: 15 }} aria-hidden="true" />}
      {msg.kind === 'location' && <div style={{ height: 15 }} aria-hidden="true" />}

      <span className="bubble__meta">
        <time>{time}</time>
      </span>
    </div>
  );
});
