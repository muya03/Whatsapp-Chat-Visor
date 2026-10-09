import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import { foldKeepLength, snippetAround, splitByQuery } from '../../features/search/highlight';
import type { SearchApi } from '../../features/search/useSearch';
import { es } from '../../i18n/es';
import type { ChatMessage } from '../../parser/whatsapp/types';
import { formatDateShort } from '../../utils/format';

interface Props {
  search: SearchApi;
  messages: ChatMessage[];
  onPick(messageId: number, cursor: number): void;
}

/** Lista virtualizada de coincidencias (puede haber decenas de miles). */
export function SearchResults({ search, messages, onPick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const q = foldKeepLength(search.query.trim());
  const virt = useVirtualizer({ count: search.hits.length, getScrollElement: () => ref.current, estimateSize: () => 66, overscan: 8 });

  if (search.query.trim() === '') return <p className="empty-note">Busca mensajes, remitentes o nombres de archivos de esta conversación.</p>;
  if (search.pending && search.hits.length === 0) return <p className="empty-note">Buscando…</p>;
  if (search.hits.length === 0) return <p className="empty-note" role="status">{es.searchNoResults}</p>;

  return (
    <div ref={ref} className="scroll" style={{ height: '100%' }}>
      <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
        {virt.getVirtualItems().map((v) => {
          const msgId = search.hits[v.index]!;
          const m = messages[msgId]!;
          const label = m.text || m.attachments.find((a) => a.fileName)?.fileName || '';
          return (
            <button
              key={v.key}
              type="button"
              className="hit"
              aria-current={v.index === search.cursor}
              onClick={() => onPick(msgId, v.index)}
              style={{ position: 'absolute', top: 0, left: 0, transform: `translateY(${v.start}px)`, height: v.size }}
            >
              <span className="hit__meta">
                <span className="hit__who truncate" dir="auto">
                  {m.sender ?? 'Aviso'}
                </span>
                <span>{m.dayKey ? formatDateShort(m.dayKey) : ''}</span>
              </span>
              <span className="hit__snip" dir="auto">
                {splitByQuery(snippetAround(label, q), q).map((s, i) => (s.hit ? <mark key={i}>{s.text}</mark> : s.text))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
