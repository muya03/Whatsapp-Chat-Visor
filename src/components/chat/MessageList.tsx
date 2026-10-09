import { useVirtualizer } from '@tanstack/react-virtual';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { nearestDay, type RowModel } from '../../features/conversation/rows';
import { foldKeepLength } from '../../features/search/highlight';
import type { ChatMessage } from '../../parser/whatsapp/types';
import { formatDayLabel, type TimeFormat } from '../../utils/format';
import { Icon } from '../Icon';
import { ChatRow } from '../message/ChatRow';

export interface MessageListHandle {
  scrollToMessage(id: number, opts?: { flash?: boolean; align?: 'center' | 'start' }): void;
  /** Salta al día indicado o al más cercano con mensajes. Devuelve el día al que se fue. */
  scrollToDay(dayKey: number): number | null;
  scrollToEnd(): void;
  scrollToStart(): void;
  firstVisibleMessage(): number | null;
}

interface Props {
  model: RowModel;
  messages: ChatMessage[];
  me: string | null;
  isGroup: boolean;
  showNamesInPrivate: boolean;
  timeFormat: TimeFormat;
  sourceHour12: boolean;
  query: string;
  currentHit: number | null;
  initialMessage: number | null;
}

const estimateRow = (model: RowModel, messages: ChatMessage[], i: number): number => {
  const row = model.rows[i]!;
  if (row.t === 'date') return 44;
  const m = messages[row.msg]!;
  if (row.t === 'sys') return 40 + Math.floor(m.text.length / 70) * 18;
  const lines = Math.max(1, Math.ceil(m.text.length / 38)) + (m.text.match(/\n/g)?.length ?? 0);
  let h = 12 + lines * 19 + (row.first ? 12 : 2) + 8;
  for (const a of m.attachments) h += a.kind === 'image' || a.kind === 'video' || a.kind === 'gif' ? 250 : a.kind === 'sticker' ? 170 : 64;
  return h;
};

export const MessageList = forwardRef<MessageListHandle, Props>(function MessageList(p, ref) {
  const { model, messages } = p;
  const parentRef = useRef<HTMLDivElement>(null);
  const [showFab, setShowFab] = useState(false);
  const [floatDay, setFloatDay] = useState<{ label: string; visible: boolean } | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const virt = useVirtualizer({
    count: model.rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => estimateRow(model, messages, i),
    overscan: 10,
    paddingEnd: 14,
    paddingStart: 6,
  });

  /**
   * Posiciona la lista en una fila y corrige durante unos fotogramas mientras se miden las alturas reales.
   * No usa el reconciliado interno de scrollToIndex (que puede seguir moviendo la lista hasta 5 s): cualquier
   * gesto del usuario (rueda, tacto, puntero, teclado) cancela el posicionamiento en curso.
   */
  const settleToken = useRef(0);
  const settleScroll = useCallback(
    (rowIndex: number, align: 'start' | 'center' | 'end') => {
      const el = parentRef.current;
      if (!el) return;
      const token = ++settleToken.current;
      const target = (): number => {
        if (align === 'end' && rowIndex >= model.rows.length - 1) return Math.max(0, el.scrollHeight - el.clientHeight);
        const hit = virt.getOffsetForIndex(rowIndex, align);
        return hit ? Math.max(0, hit[0]) : el.scrollTop;
      };
      let stable = 0;
      let frames = 0;
      const step = () => {
        if (token !== settleToken.current || !parentRef.current) return;
        const want = target();
        if (Math.abs(el.scrollTop - want) > 1) {
          el.scrollTop = want;
          stable = 0;
        } else stable++;
        // 3 fotogramas seguidos sin cambios = las alturas ya no se mueven.
        if (stable < 3 && ++frames < 40) requestAnimationFrame(step);
      };
      step();
    },
    [virt, model],
  );

  // Cualquier gesto del usuario cancela un posicionamiento automático en curso.
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const cancel = () => {
      settleToken.current++;
    };
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    events.forEach((e) => el.addEventListener(e, cancel, { passive: true }));
    return () => events.forEach((e) => el.removeEventListener(e, cancel));
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      scrollToMessage(id, opts) {
        const rowIndex = model.msgToRow[id];
        if (rowIndex === undefined) return;
        settleScroll(rowIndex, opts?.align ?? 'center');
        if (opts?.flash) {
          setFlashId(id);
          clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setFlashId(null), 1700);
        }
      },
      scrollToDay(dayKey) {
        const day = nearestDay(model.days, dayKey);
        if (day === null) return null;
        const rowIndex = model.dayToRow.get(day);
        if (rowIndex !== undefined) settleScroll(rowIndex, 'start');
        return day;
      },
      scrollToEnd() {
        settleScroll(model.rows.length - 1, 'end');
      },
      scrollToStart() {
        settleScroll(0, 'start');
      },
      firstVisibleMessage() {
        const first = virt.getVirtualItems()[0];
        if (!first) return null;
        for (let i = first.index; i < model.rows.length; i++) {
          const r = model.rows[i]!;
          if (r.t !== 'date') return r.msg;
        }
        return null;
      },
    }),
    [model, settleScroll, virt],
  );

  // Posición inicial: el último mensaje (o el que se estaba leyendo si se reconstruyó la lista).
  useLayoutEffect(() => {
    if (model.rows.length === 0) return;
    if (p.initialMessage !== null && model.msgToRow[p.initialMessage] !== undefined) settleScroll(model.msgToRow[p.initialMessage]!, 'start');
    else settleScroll(model.rows.length - 1, 'end');
    // Solo al montar con este modelo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // Resultado actual de la búsqueda: se centra y se resalta.
  useEffect(() => {
    if (p.currentHit === null) return;
    const rowIndex = model.msgToRow[p.currentHit];
    if (rowIndex !== undefined) settleScroll(rowIndex, 'center');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.currentHit]);

  // Botón «ir al final» y fecha flotante, calculados en el scroll sin renderizar toda la lista.
  const onScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowFab(fromBottom > Math.max(500, el.clientHeight * 0.8));
    const first = virt.getVirtualItems().find((v) => v.start + v.size > el.scrollTop + 4);
    if (first) {
      const r = model.rows[first.index];
      // Si el separador real de ese día ya está a la vista arriba, no se duplica con la fecha flotante.
      if (r?.t === 'date' && first.start >= el.scrollTop - 4) {
        setFloatDay((c) => (c?.visible ? { ...c, visible: false } : c));
        return;
      }
      const dayKey = r ? (r.t === 'date' ? r.dayKey : messages[r.msg]?.dayKey) : null;
      if (dayKey) {
        const label = formatDayLabel(dayKey);
        setFloatDay((cur) => (cur && cur.label === label && cur.visible ? cur : { label, visible: true }));
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setFloatDay((c) => (c ? { ...c, visible: false } : c)), 1300);
      }
    }
  }, [virt, model, messages]);

  useEffect(
    () => () => {
      clearTimeout(hideTimer.current);
      clearTimeout(flashTimer.current);
    },
    [],
  );

  const hlQuery = useMemo(() => (p.query ? foldKeepLength(p.query.trim()) : ''), [p.query]);
  const items = virt.getVirtualItems();

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'End') {
      e.preventDefault();
      settleScroll(model.rows.length - 1, 'end');
    } else if (e.key === 'Home') {
      e.preventDefault();
      settleScroll(0, 'start');
    }
  };

  return (
    <>
      <div ref={parentRef} className="msglist" onScroll={onScroll} tabIndex={0} role="region" aria-label="Mensajes de la conversación" onKeyDown={onKeyDown}>
        <div className="msglist__inner" style={{ height: virt.getTotalSize() }} role="list">
          {items.map((v) => {
            const row = model.rows[v.index]!;
            const msg = row.t === 'date' ? undefined : messages[row.msg];
            return (
              <div
                key={v.key}
                data-index={v.index}
                ref={virt.measureElement}
                className="msglist__row"
                role="listitem"
                style={{ transform: `translateY(${v.start}px)` }}
              >
                <ChatRow
                  row={row}
                  msg={msg}
                  me={p.me}
                  isGroup={p.isGroup}
                  showNamesInPrivate={p.showNamesInPrivate}
                  timeFormat={p.timeFormat}
                  sourceHour12={p.sourceHour12}
                  hlQuery={hlQuery}
                  hlCurrent={row.t !== 'date' && row.msg === p.currentHit}
                  flash={row.t !== 'date' && row.msg === flashId}
                />
              </div>
            );
          })}
        </div>
      </div>
      {floatDay && (
        <div className="float-date" data-visible={floatDay.visible} aria-hidden="true">
          <span className="chip chip--date">{floatDay.label}</span>
        </div>
      )}
      {showFab && (
        <button type="button" className="fab" onClick={() => settleScroll(model.rows.length - 1, 'end')} aria-label="Ir al último mensaje" title="Ir al último mensaje">
          <Icon name="down" size={28} />
        </button>
      )}
    </>
  );
});
