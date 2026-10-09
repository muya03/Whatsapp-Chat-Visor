import { useEffect, useRef } from 'react';
import type { SearchApi } from '../../features/search/useSearch';
import { es } from '../../i18n/es';
import { Icon } from '../Icon';

interface Props {
  search: SearchApi;
  autoFocus?: boolean;
  /** Estilo compacto de cabecera móvil (sin fondo propio). */
  inHeader?: boolean;
}

export function SearchField({ search, autoFocus, inHeader }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const total = search.hits.length;
  const hasQuery = search.query.trim() !== '';
  return (
    <div className="searchbox" role="search" style={inHeader ? { flex: 1, background: 'transparent', padding: 0 } : undefined}>
      <Icon name="search" size={20} />
      <input
        ref={ref}
        type="search"
        enterKeyHint="search"
        placeholder={es.searchPlaceholder}
        aria-label={es.searchPlaceholder}
        value={search.query}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => search.setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) search.prev();
            else search.next();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            search.close();
          }
        }}
      />
      {hasQuery && !search.pending && (
        <span className="searchbox__counter" aria-live="polite">
          {total === 0 ? '0' : es.searchCounter(search.cursor + 1, total)}
        </span>
      )}
      {hasQuery && search.pending && <span className="searchbox__counter">…</span>}
      <button type="button" className="icon-btn" onClick={search.prev} disabled={total < 2} aria-label={es.searchPrev} title={es.searchPrev}>
        <Icon name="up" size={22} />
      </button>
      <button type="button" className="icon-btn" onClick={search.next} disabled={total < 2} aria-label={es.searchNext} title={es.searchNext}>
        <Icon name="down" size={22} />
      </button>
      <button type="button" className="icon-btn" onClick={search.close} aria-label="Cerrar búsqueda" title="Cerrar búsqueda">
        <Icon name="close" size={20} />
      </button>
    </div>
  );
}
