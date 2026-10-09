import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

const MOBILE_QUERY = '(max-width: 799px), (max-height: 519px) and (pointer: coarse)';

/** Diseño móvil: pantalla estrecha, o teléfono en horizontal (poca altura y puntero táctil). */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(MOBILE_QUERY);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}

export function useMediaQuery(query: string): boolean {
  const [m, setM] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    on();
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}

/**
 * Altura real visible (visualViewport): en Safari de iOS el teclado virtual no cambia 100dvh,
 * así que se expone como --vv-height y la aplicación se ajusta a ella.
 */
export function useVisualViewportHeight(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const apply = () => {
      root.style.setProperty('--vv-height', `${Math.round(vv.height)}px`);
      // Con el teclado abierto iOS desplaza el viewport visual: se mantiene la página anclada arriba.
      if (vv.offsetTop > 0) window.scrollTo(0, 0);
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      root.style.removeProperty('--vv-height');
    };
  }, []);
}

const escapeStack: symbol[] = [];
const escapeHandlers = new Map<symbol, () => void>();
let escapeBound = false;

function bindEscape() {
  if (escapeBound) return;
  escapeBound = true;
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const top = escapeStack[escapeStack.length - 1];
    if (!top) return;
    e.preventDefault();
    escapeHandlers.get(top)?.();
  });
}

/** Escape cierra solo lo que está más arriba (menú sobre diálogo sobre visor...). */
export function useEscape(handler: () => void, active = true): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    bindEscape();
    const id = Symbol('esc');
    escapeStack.push(id);
    escapeHandlers.set(id, () => ref.current());
    return () => {
      escapeStack.splice(escapeStack.indexOf(id), 1);
      escapeHandlers.delete(id);
    };
  }, [active]);
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Resuelve el tema efectivo (claro/oscuro) a partir de la preferencia y del sistema. */
export function useSystemDark(): boolean {
  return useMediaQuery('(prefers-color-scheme: dark)');
}
