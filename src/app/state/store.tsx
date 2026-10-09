import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { conversationTitle } from '../../features/conversation/title';
import { buildRows, type RowModel } from '../../features/conversation/rows';
import { disposeImported, type ImportedChat } from '../../features/import/importer';
import { DEFAULT_PREFS, detectSkin, loadPrefs, savePrefs, type Prefs } from '../../features/preferences/prefs';
import type { ChatStats, DateOrderSetting, ParsedChat } from '../../parser/whatsapp/types';
import { useIsMobile, useSystemDark } from './hooks';

export interface Session {
  id: string;
  imported: ImportedChat;
  /** Se reemplaza al cambiar el orden de fecha (el resto de datos del import no cambia). */
  chat: ParsedChat;
  rows: RowModel;
  me: string | null;
  customTitle: string | null;
  avatarUrl: string | null;
  dateOrderSetting: DateOrderSetting;
  importedAt: number;
  stats: ChatStats | null;
}

interface State {
  sessions: Session[];
  activeId: string | null;
}

type Action =
  | { type: 'add'; session: Session }
  | { type: 'remove'; id: string }
  | { type: 'patch'; id: string; patch: Partial<Session> }
  | { type: 'activate'; id: string | null };

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case 'add':
      return { sessions: [...state.sessions, a.session], activeId: a.session.id };
    case 'remove': {
      const sessions = state.sessions.filter((s) => s.id !== a.id);
      const activeId = state.activeId === a.id ? (sessions[sessions.length - 1]?.id ?? null) : state.activeId;
      return { sessions, activeId };
    }
    case 'patch':
      return { ...state, sessions: state.sessions.map((s) => (s.id === a.id ? { ...s, ...a.patch } : s)) };
    case 'activate':
      return { ...state, activeId: a.id };
  }
}

interface StoreApi {
  sessions: Session[];
  active: Session | null;
  addSession(imported: ImportedChat): Session;
  removeSession(id: string): void;
  patchSession(id: string, patch: Partial<Session>): void;
  activate(id: string): void;
  titleOf(s: Session): string;
  prefs: Prefs;
  setPrefs(patch: Partial<Prefs>): void;
  /** Vuelve a las preferencias por defecto sin escribir nada en el almacenamiento (tras «eliminar datos locales»). */
  resetPrefs(): void;
  resolvedTheme: 'light' | 'dark';
  resolvedSkin: 'web' | 'android' | 'ios';
  isMobile: boolean;
}

const Ctx = createContext<StoreApi | null>(null);
let counter = 0;

function useStateRef<T>(v: T) {
  const r = useRef(v);
  r.current = v;
  return r;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { sessions: [], activeId: null });
  const [prefs, setPrefsState] = useState<Prefs>(() => (typeof localStorage === 'undefined' ? DEFAULT_PREFS : loadPrefs()));
  const isMobile = useIsMobile();
  const systemDark = useSystemDark();

  const resolvedTheme: 'light' | 'dark' = prefs.theme === 'system' ? (systemDark ? 'dark' : 'light') : prefs.theme;
  const resolvedSkin = prefs.skin === 'auto' ? detectSkin(isMobile) : prefs.skin;

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-resolved-theme', resolvedTheme);
    root.setAttribute('data-skin', resolvedSkin);
    if (prefs.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', prefs.theme);
    // El color de la barra del sistema sigue a la cabecera para que PWA/Android se vean integrados.
    const header = getComputedStyle(root).getPropertyValue('--c-header-bg').trim();
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.removeAttribute('media');
      if (header) m.setAttribute('content', header);
    });
  }, [resolvedTheme, resolvedSkin, prefs.theme]);

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  const resetPrefs = useCallback(() => setPrefsState({ ...DEFAULT_PREFS }), []);

  const addSession = useCallback((imported: ImportedChat): Session => {
    const session: Session = {
      id: `s${++counter}-${Date.now().toString(36)}`,
      imported,
      chat: imported.chat,
      rows: buildRows(imported.chat.messages),
      me: null,
      customTitle: null,
      avatarUrl: null,
      dateOrderSetting: 'auto',
      importedAt: Date.now(),
      stats: null,
    };
    dispatch({ type: 'add', session });
    // Las estadísticas se calculan en segundo plano; llegan cuando están listas.
    void imported.client.stats().then((stats) => dispatch({ type: 'patch', id: session.id, patch: { stats } }), () => undefined);
    return session;
  }, []);

  const removeSession = useCallback((id: string) => dispatch({ type: 'remove', id }), []);
  // La liberación de recursos se hace aquí para que ocurra en un único sitio.
  const removeAndDispose = useCallback(
    (id: string) => {
      const s = stateRef.current.sessions.find((x) => x.id === id);
      if (s) {
        disposeImported(s.imported);
        if (s.avatarUrl) URL.revokeObjectURL(s.avatarUrl);
      }
      removeSession(id);
    },
    [removeSession],
  );
  const stateRef = useStateRef(state);

  const patchSession = useCallback((id: string, patch: Partial<Session>) => dispatch({ type: 'patch', id, patch }), []);
  const activate = useCallback((id: string) => dispatch({ type: 'activate', id }), []);

  const value = useMemo<StoreApi>(
    () => ({
      sessions: state.sessions,
      active: state.sessions.find((s) => s.id === state.activeId) ?? null,
      addSession,
      removeSession: removeAndDispose,
      patchSession,
      activate,
      titleOf: (s) => conversationTitle(s.chat, s.imported.fileName, s.me, s.customTitle),
      prefs,
      setPrefs,
      resetPrefs,
      resolvedTheme,
      resolvedSkin,
      isMobile,
    }),
    [state, addSession, removeAndDispose, patchSession, activate, prefs, setPrefs, resetPrefs, resolvedTheme, resolvedSkin, isMobile],
  );

  // Al cerrar la pestaña se liberan workers y URL temporales (no hay nada que guardar).
  useEffect(() => {
    const onHide = () => stateRef.current.sessions.forEach((s) => disposeImported(s.imported));
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [stateRef]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): StoreApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider ausente');
  return v;
}
