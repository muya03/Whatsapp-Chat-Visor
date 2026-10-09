import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type NavEntry =
  | { kind: 'chat' }
  | { kind: 'landing' }
  | { kind: 'info' }
  | { kind: 'settings' }
  | { kind: 'whoami' }
  | { kind: 'date' }
  | { kind: 'export' }
  | { kind: 'media'; index: number }
  | { kind: 'menu-more' };

interface NavApi {
  stack: NavEntry[];
  top: NavEntry | null;
  has(kind: NavEntry['kind']): boolean;
  push(entry: NavEntry): void;
  /** Cierra la entrada superior (equivale al botón «Atrás» del sistema). */
  back(): void;
  /** Sustituye la entrada superior sin crear historial (p. ej. pasar de una imagen a la siguiente). */
  replaceTop(entry: NavEntry): void;
  /** Cierra todas las entradas hasta dejar la pila vacía. */
  reset(): void;
}

const Ctx = createContext<NavApi | null>(null);

/**
 * Pila de navegación sincronizada con el historial del navegador: el botón «Atrás» del móvil
 * (o del navegador) cierra primero visores, diálogos y paneles, y por último vuelve de la
 * conversación a la lista, como en WhatsApp.
 */
export function NavProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<NavEntry[]>([]);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const depth = typeof e.state?.wvDepth === 'number' ? (e.state.wvDepth as number) : 0;
      setStack((s) => (depth < s.length ? s.slice(0, depth) : s));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const push = useCallback((entry: NavEntry) => {
    const next = [...stackRef.current, entry];
    stackRef.current = next;
    setStack(next);
    try {
      history.pushState({ wvDepth: next.length }, '');
    } catch {
      /* entornos sin History API */
    }
  }, []);

  const back = useCallback(() => {
    if (stackRef.current.length === 0) return;
    if (history.state && typeof history.state.wvDepth === 'number') history.back();
    else setStack((s) => s.slice(0, -1));
  }, []);

  const replaceTop = useCallback((entry: NavEntry) => {
    setStack((s) => (s.length === 0 ? s : [...s.slice(0, -1), entry]));
  }, []);

  const reset = useCallback(() => {
    const n = stackRef.current.length;
    if (n === 0) return;
    setStack([]);
    stackRef.current = [];
    try {
      if (history.state && typeof history.state.wvDepth === 'number') history.go(-n);
    } catch {
      /* ignorar */
    }
  }, []);

  const api = useMemo<NavApi>(
    () => ({
      stack,
      top: stack[stack.length - 1] ?? null,
      has: (kind) => stack.some((e) => e.kind === kind),
      push,
      back,
      replaceTop,
      reset,
    }),
    [stack, push, back, replaceTop, reset],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useNav(): NavApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('NavProvider ausente');
  return v;
}
