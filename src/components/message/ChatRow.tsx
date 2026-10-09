import { memo } from 'react';
import type { Row } from '../../features/conversation/rows';
import { splitByQuery } from '../../features/search/highlight';
import type { ChatMessage } from '../../parser/whatsapp/types';
import { formatDayLabel, type TimeFormat } from '../../utils/format';
import { Icon } from '../Icon';
import { Bubble, type Side } from './Bubble';

export interface ChatRowProps {
  row: Row;
  msg: ChatMessage | undefined;
  me: string | null;
  isGroup: boolean;
  showNamesInPrivate: boolean;
  timeFormat: TimeFormat;
  sourceHour12: boolean;
  hlQuery: string;
  hlCurrent: boolean;
  flash: boolean;
}

function Plain({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  return (
    <>
      {splitByQuery(text, query).map((s, i) => (s.hit ? <mark key={i}>{s.text}</mark> : s.text))}
    </>
  );
}

export const ChatRow = memo(function ChatRow(p: ChatRowProps) {
  const { row, msg } = p;
  if (row.t === 'date') {
    return (
      <div className="row row--center row--chip">
        <span className="chip chip--date">{formatDayLabel(row.dayKey)}</span>
      </div>
    );
  }
  if (!msg) return null;
  if (row.t === 'sys') {
    const notice = msg.system === 'encryption';
    const unparsed = msg.system === 'unparsed';
    return (
      <div className="row row--center row--chip">
        <span className={`chip${notice ? ' chip--notice' : ''}${unparsed ? ' chip--unparsed' : ''}`} dir="auto" data-msg={msg.id} data-flash={p.flash || undefined}>
          {notice && <Icon name="lock" />}
          {unparsed && <strong>Texto sin fecha reconocible: </strong>}
          <Plain text={msg.text} query={p.hlQuery} />
        </span>
      </div>
    );
  }
  // Sin "yo" identificado: presentación neutral (todo a la izquierda, con nombre) en lugar de inventar quién es quién.
  const neutral = p.me === null;
  const side: Side = !neutral && msg.sender === p.me ? 'out' : 'in';
  const showName = row.first && side === 'in' && (neutral || p.isGroup || p.showNamesInPrivate);
  return (
    <div className={`row row--${side} ${row.first ? 'row--first' : 'row--cont'}`}>
      <Bubble
        msg={msg}
        side={side}
        first={row.first}
        showName={showName}
        timeFormat={p.timeFormat}
        sourceHour12={p.sourceHour12}
        hlQuery={p.hlQuery}
        hlCurrent={p.hlCurrent}
        flash={p.flash}
      />
    </div>
  );
});
