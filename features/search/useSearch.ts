import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatClient } from '../import/chatClient';

const EMPTY = new Int32Array(0);

export interface SearchApi {
  open: boolean;
  query: string;
  hits: Int32Array;
  /** Índice dentro de `hits`; -1 si no hay resultados. */
  cursor: number;
  currentMessage: number | null;
  pending: boolean;
  setQuery(q: string): void;
  openSearch(): void;
  close(): void;
  next(): void;
  prev(): void;
  select(cursor: number): void;
}

/**
 * Estado de la búsqueda de una conversación. La consulta se resuelve en el worker (índice de toda
 * la conversación). Se arranca en el resultado más reciente; «anterior» va hacia atrás en el tiempo.
 */
export function useSearch(client: ChatClient | null, resetKey: string | null): SearchApi {
  const [open, setOpen] = useState(false);
  const [query, setQueryState] = useState('');
  const [hits, setHits] = useState<Int32Array>(EMPTY);
  const [cursor, setCursor] = useState(-1);
  const [pending, setPending] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    setOpen(false);
    setQueryState('');
    setHits(EMPTY);
    setCursor(-1);
    setPending(false);
  }, [resetKey]);

  useEffect(() => {
    const q = query.trim();
    if (!client || !open || q === '') {
      setHits(EMPTY);
      setCursor(-1);
      setPending(false);
      return;
    }
    const mine = ++seq.current;
    setPending(true);
    const t = setTimeout(() => {
      client.search(q).then((h) => {
        if (mine !== seq.current) return; // llegó tarde: ya hay una consulta más nueva
        setHits(h);
        setCursor(h.length - 1);
        setPending(false);
      });
    }, 140);
    return () => clearTimeout(t);
  }, [client, query, open]);

  const step = useCallback(
    (d: 1 | -1) => {
      if (hits.length === 0) return;
      setCursor((c) => (c + d + hits.length) % hits.length);
    },
    [hits],
  );

  return useMemo<SearchApi>(
    () => ({
      open,
      query,
      hits,
      cursor,
      currentMessage: cursor >= 0 ? (hits[cursor] ?? null) : null,
      pending,
      setQuery: setQueryState,
      openSearch: () => setOpen(true),
      close: () => {
        setOpen(false);
        setQueryState('');
      },
      next: () => step(1),
      prev: () => step(-1),
      select: (c) => setCursor(c),
    }),
    [open, query, hits, cursor, pending, step],
  );
}
