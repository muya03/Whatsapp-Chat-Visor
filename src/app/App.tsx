import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatHeader } from '../components/layout/ChatHeader';
import { InstallHelp, InstallHint } from '../components/layout/InstallHint';
import type { MenuItem } from '../components/layout/Menu';
import { SidePanel } from '../components/layout/SidePanel';
import { ToastProvider, useToast } from '../components/layout/Toast';
import { InfoPanel } from '../components/chat/InfoPanel';
import { MessageList, type MessageListHandle } from '../components/chat/MessageList';
import { NoticeBar } from '../components/chat/NoticeBar';
import { DateJumpDialog } from '../components/dialogs/DateJumpDialog';
import { ExportDialog } from '../components/dialogs/ExportDialog';
import { SettingsDialog } from '../components/dialogs/SettingsDialog';
import { WhoAmIDialog } from '../components/dialogs/WhoAmIDialog';
import { Icon } from '../components/Icon';
import { EntryPicker } from '../components/import/EntryPicker';
import { Landing, type ImportUi } from '../components/import/Landing';
import { MediaCtx, type MediaCtxValue } from '../components/media/MediaContext';
import { MediaViewer } from '../components/media/MediaViewer';
import { buildRows } from '../features/conversation/rows';
import { conversationSubtitle } from '../features/conversation/title';
import { importFile } from '../features/import/importer';
import { collectViewable } from '../features/media/mediaUtils';
import { useSearch } from '../features/search/useSearch';
import { es } from '../i18n/es';
import type { DateOrderSetting } from '../parser/whatsapp/types';
import { ImportError } from '../services/fileValidation';
import { deleteSaved, hasSavedFlag, listSaved, loadSaved, saveImport, StorageError, type SavedMeta } from '../services/importStore';
import type { ZipEntryInfo } from '../services/zipReader';
import { registerServiceWorker, useInstall, useUpdateAvailable } from '../pwa/pwa';
import { formatDateShort } from '../utils/format';
import { useEscape, useVisualViewportHeight } from './state/hooks';
import { NavProvider, useNav } from './state/nav';
import { AppProvider, useApp } from './state/store';

registerServiceWorker();

export function App() {
  return (
    <ToastProvider>
      <NavProvider>
        <AppProvider>
          <Shell />
        </AppProvider>
      </NavProvider>
    </ToastProvider>
  );
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

function Shell() {
  const app = useApp();
  const nav = useNav();
  const { toast, dismiss } = useToast();
  const { sessions, active, isMobile, prefs } = app;
  const install = useInstall();
  const update = useUpdateAvailable();
  useVisualViewportHeight();

  const [ui, setUi] = useState<ImportUi>({ phase: 'idle' });
  const [picker, setPicker] = useState<{ candidates: ZipEntryInfo[]; resolve(e: ZipEntryInfo | null): void } | null>(null);
  const [saved, setSaved] = useState<SavedMeta[]>([]);
  const [installHelp, setInstallHelp] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<MessageListHandle>(null);
  const anchorRef = useRef<number | null>(null);

  const refreshSaved = useCallback(() => {
    if (!hasSavedFlag()) return setSaved([]);
    void listSaved().then(setSaved);
  }, []);
  useEffect(refreshSaved, [refreshSaved]);

  useEffect(() => {
    if (!update.available) return;
    const id = toast('Hay una nueva versión de la aplicación.', { duration: 0, action: { label: 'Actualizar', onClick: update.apply } });
    return () => dismiss(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [update.available]);

  // Si la ventana pasa de escritorio a móvil con una conversación abierta, se queda en la conversación.
  const wasMobile = useRef(isMobile);
  useEffect(() => {
    if (isMobile && !wasMobile.current && active && !nav.has('chat')) nav.push({ kind: 'chat' });
    wasMobile.current = isMobile;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  const showLanding = sessions.length === 0 || nav.has('landing');
  const chatScreen = !isMobile || nav.has('chat');
  const search = useSearch(active?.imported.client ?? null, active?.id ?? null);

  /* ------------------------------- importación ------------------------------- */
  const startImport = useCallback(
    async (input: FileList | File[] | File, opts?: { fromSaved?: boolean }) => {
      const files = input instanceof File ? [input] : [...input];
      const file = files[0];
      if (!file) return;
      if (files.length > 1) toast('Solo se abre un archivo cada vez: se ha usado el primero.');
      if (sessions.length > 0 && !nav.has('landing')) nav.push({ kind: 'landing' });
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setUi({ phase: 'working', fileName: file.name, progress: { stage: 'validating', ratio: 0 } });
      try {
        const imported = await importFile(file, {
          signal: ctrl.signal,
          onProgress: (progress) => setUi({ phase: 'working', fileName: file.name, progress }),
          chooseEntry: (candidates) => new Promise((resolve) => setPicker({ candidates, resolve })),
        });
        app.addSession(imported);
        setUi({ phase: 'idle' });
        search.close();
        // Primera pantalla útil: la conversación (en móvil, como pantalla propia) y la pregunta «¿quién eres?».
        if (nav.top?.kind === 'landing') {
          nav.replaceTop(isMobile ? { kind: 'chat' } : { kind: 'whoami' });
          if (isMobile) nav.push({ kind: 'whoami' });
        } else {
          if (isMobile && !nav.has('chat')) nav.push({ kind: 'chat' });
          nav.push({ kind: 'whoami' });
        }
        if (prefs.rememberChats && !opts?.fromSaved) void persist(file, imported.sourceKind);
      } catch (e) {
        const err = e instanceof ImportError ? e : new ImportError('unknown');
        if (err.code === 'cancelled') {
          setUi({ phase: 'idle' });
          toast('Importación cancelada.');
        } else setUi({ phase: 'error', error: err, fileName: file.name });
      } finally {
        abortRef.current = null;
        setPicker(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions.length, isMobile, prefs.rememberChats, nav.stack],
  );

  const persist = useCallback(
    async (file: File, kind: 'txt' | 'zip') => {
      const ctrl = new AbortController();
      const id = toast('Guardando en este dispositivo…', { duration: 0, action: { label: 'Cancelar', onClick: () => ctrl.abort() } });
      try {
        await saveImport(file, kind, ctrl.signal);
        toast('Conversación guardada en este dispositivo.');
        refreshSaved();
      } catch (e) {
        const code = e instanceof StorageError ? e.code : 'unknown';
        if (code === 'aborted') toast('Guardado cancelado.');
        else if (code === 'quota') toast('Almacenamiento lleno: no se pudo guardar. La conversación sigue abierta.');
        else toast('No se pudo guardar en este dispositivo.');
      } finally {
        dismiss(id);
      }
    },
    [toast, dismiss, refreshSaved],
  );

  const cancelImport = () => {
    picker?.resolve(null);
    abortRef.current?.abort();
  };

  // Soltar un archivo sobre la conversación abre otra importación.
  const onDropOnApp = (e: React.DragEvent) => {
    if (e.dataTransfer.files.length > 0) {
      e.preventDefault();
      void startImport(e.dataTransfer.files);
    }
  };

  /* ------------------------------- atajos globales ------------------------------- */
  useEffect(() => {
    if (showLanding || !active) return;
    const onKey = (e: KeyboardEvent) => {
      const modalOpen = nav.stack.some((n) => n.kind !== 'chat' && n.kind !== 'info');
      if (modalOpen) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        search.openSearch();
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.searchbox input')?.focus());
      } else if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        search.openSearch();
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.searchbox input')?.focus());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showLanding, active, nav.stack, search]);

  useEscape(() => nav.back(), nav.top?.kind === 'info');

  /* ------------------------------- acciones de conversación ------------------------------- */
  const changeDateOrder = useCallback(
    async (setting: DateOrderSetting) => {
      if (!active) return;
      anchorRef.current = listRef.current?.firstVisibleMessage() ?? null;
      try {
        const { chat } = await active.imported.client.parse(active.imported.chatBlob, setting, () => undefined);
        app.patchSession(active.id, { chat, rows: buildRows(chat.messages), dateOrderSetting: setting, stats: null });
        void active.imported.client.stats().then((stats) => app.patchSession(active.id, { stats }), () => undefined);
        search.close();
      } catch {
        toast('No se pudieron reinterpretar las fechas.');
      }
    },
    [active, app, search, toast],
  );

  const viewableCache = useRef<{ key: object; items: ReturnType<typeof collectViewable> } | null>(null);
  const viewable = useCallback(() => {
    if (!active) return [];
    if (viewableCache.current?.key !== active.chat) viewableCache.current = { key: active.chat, items: collectViewable(active.chat.messages, active.imported.media) };
    return viewableCache.current.items;
  }, [active]);

  const mediaCtx = useMemo<MediaCtxValue | null>(
    () =>
      active
        ? {
            media: active.imported.media,
            store: active.imported.mediaStore,
            hasZip: active.imported.sourceKind === 'zip',
            openViewer: (msgId, attIndex) => {
              const idx = viewable().findIndex((v) => v.msgId === msgId && v.attIndex === attIndex);
              if (idx >= 0) nav.push({ kind: 'media', index: idx });
            },
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active?.id, active?.chat, viewable],
  );

  const listKey = useMemo(() => (active ? `${active.id}:${rowsVersion(active.rows)}` : 'none'), [active]);
  const initialMsg = anchorRef.current;
  useEffect(() => {
    anchorRef.current = null;
  });

  const title = active ? app.titleOf(active) : '';
  const subtitle = active ? conversationSubtitle(active.chat, active.stats, formatDateShort, es.messagesCount) : '';
  const openInfo = () => !nav.has('info') && nav.push({ kind: 'info' });

  const menuItems: MenuItem[] = active
    ? [
        { id: 'info', label: es.info, icon: 'info', onSelect: openInfo },
        { id: 'search', label: es.search, icon: 'search', onSelect: search.openSearch },
        { id: 'date', label: es.goToDate, icon: 'calendar', onSelect: () => nav.push({ kind: 'date' }) },
        { id: 'end', label: es.jumpToEnd, icon: 'arrowDown', onSelect: () => listRef.current?.scrollToEnd() },
        { id: 'export', label: 'Exportar copia visual…', icon: 'download', separatorBefore: true, onSelect: () => nav.push({ kind: 'export' }) },
        ...(prefs.rememberChats ? [{ id: 'save', label: 'Guardar en este dispositivo', icon: 'install' as const, onSelect: () => void persist(active.imported.source, active.imported.sourceKind) }] : []),
        { id: 'settings', label: es.settings, icon: 'settings', separatorBefore: true, onSelect: () => nav.push({ kind: 'settings' }) },
        { id: 'import', label: es.importAnother, icon: 'upload', onSelect: () => nav.push({ kind: 'landing' }) },
        { id: 'close', label: 'Cerrar conversación', icon: 'close', onSelect: () => { const id = active.id; if (isMobile) nav.back(); app.removeSession(id); } },
      ]
    : [];

  /* ------------------------------- render ------------------------------- */
  const top = nav.stack;
  const overlays = (
    <>
      {picker && (
        <EntryPicker
          candidates={picker.candidates}
          onChoose={(e) => { picker.resolve(e); setPicker(null); }}
          onCancel={cancelImport}
        />
      )}
      {top.map((entry, i) => {
        switch (entry.kind) {
          case 'whoami':
            return active ? <WhoAmIDialog key={`w${i}`} session={active} onChange={(me) => app.patchSession(active.id, { me })} onClose={nav.back} /> : null;
          case 'date':
            return active ? (
              <DateJumpDialog
                key={`d${i}`}
                days={active.rows.days}
                onJump={(k) => { listRef.current?.scrollToDay(k); nav.back(); }}
                onJumpEnd={() => { listRef.current?.scrollToEnd(); nav.back(); }}
                onClose={nav.back}
              />
            ) : null;
          case 'settings':
            return (
              <SettingsDialog
                key={`s${i}`}
                session={active}
                onClose={nav.back}
                onChangeDateOrder={changeDateOrder}
                onForgetAll={() => { setSaved([]); app.resetPrefs(); }}
                focusDate={top[i + 1] === undefined && false}
              />
            );
          case 'export':
            return active ? <ExportDialog key={`e${i}`} session={active} title={title} onClose={nav.back} /> : null;
          case 'media':
            return active ? (
              <MediaViewer
                key={`m${i}`}
                session={active}
                items={viewable()}
                index={entry.index}
                onIndex={(idx) => nav.replaceTop({ kind: 'media', index: idx })}
                onClose={nav.back}
                onShowInChat={(id) => { nav.back(); listRef.current?.scrollToMessage(id, { flash: true }); }}
              />
            ) : null;
          default:
            return null;
        }
      })}
      {installHelp && <InstallHelp onClose={() => setInstallHelp(false)} />}
    </>
  );

  if (showLanding) {
    return (
      <>
        <Landing
          ui={ui}
          hasSessions={sessions.length > 0}
          saved={saved}
          onFiles={(f) => void startImport(f)}
          onCancel={cancelImport}
          onBack={() => (ui.phase === 'working' ? cancelImport() : nav.back())}
          onSettings={() => nav.push({ kind: 'settings' })}
          onOpenSaved={async (id) => {
            const f = await loadSaved(id);
            if (f) void startImport(f, { fromSaved: true });
            else toast('No se pudo abrir esa conversación guardada.');
          }}
          onDeleteSaved={async (id) => { await deleteSaved(id); refreshSaved(); }}
          installSlot={<InstallHint />}
        />
        {overlays}
      </>
    );
  }

  const drawerOpen = nav.has('info') && !!active;
  const hour12 = active ? prefs.timeFormat === '12' || (prefs.timeFormat === 'auto' && active.chat.sourceHour12) : false;

  return (
    <>
      <div
        className={`app${isMobile ? ' app--mobile' : ''}${drawerOpen && !isMobile ? ' app--drawer' : ''}`}
        data-12h={hour12}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDropOnApp}
      >
        <SidePanel
          hidden={isMobile && chatScreen}
          search={search}
          onSelect={(id) => {
            app.activate(id);
            if (isMobile && !nav.has('chat')) nav.push({ kind: 'chat' });
          }}
          onImport={() => nav.push({ kind: 'landing' })}
          onOpenSettings={() => nav.push({ kind: 'settings' })}
          onShowInstall={install.canPrompt ? () => void install.prompt() : install.manualIOS ? () => setInstallHelp(true) : undefined}
          onPickResult={(id) => listRef.current?.scrollToMessage(id, { flash: true })}
        />

        {active && mediaCtx && (
          <main className="main" data-active={chatScreen} aria-hidden={!chatScreen || undefined}>
            <ChatHeader
              title={title}
              subtitle={subtitle}
              isGroup={active.chat.isGroup}
              avatarUrl={active.avatarUrl}
              isMobile={isMobile}
              showBack={isMobile}
              search={search}
              searchInHeader={isMobile}
              onBack={() => nav.top?.kind === 'chat' && nav.back()}
              onInfo={openInfo}
              onDate={() => nav.push({ kind: 'date' })}
              menuItems={menuItems}
            />
            <NoticeBar
              key={active.id}
              session={active}
              onFixDate={() => nav.push({ kind: 'settings' })}
              onDetails={openInfo}
            />
            <div className="chat">
              <MediaCtx.Provider value={mediaCtx}>
                {active.chat.messages.length === 0 ? (
                  <p className="empty-note" style={{ position: 'relative' }}>La conversación está vacía.</p>
                ) : (
                  <MessageList
                    key={listKey}
                    ref={listRef}
                    model={active.rows}
                    messages={active.chat.messages}
                    me={active.me}
                    isGroup={active.chat.isGroup}
                    showNamesInPrivate={prefs.showNamesInPrivate}
                    timeFormat={prefs.timeFormat}
                    sourceHour12={active.chat.sourceHour12}
                    query={search.open ? search.query : ''}
                    currentHit={search.open ? search.currentMessage : null}
                    initialMessage={initialMsg}
                  />
                )}
              </MediaCtx.Provider>
              {isMobile && search.open && search.query.trim() !== '' && !search.pending && search.hits.length === 0 && (
                <div className="float-date" data-visible="true" role="status">
                  <span className="chip">{es.searchNoResults}</span>
                </div>
              )}
            </div>
            <footer className="footer">
              <div className="footer__pill" role="note">
                <Icon name="lock" />
                <span className="footer__long">{es.readOnlyBar}</span>
                <span className="footer__short">{es.readOnlyShort}</span>
              </div>
            </footer>
          </main>
        )}

        {drawerOpen && active && (
          <InfoPanel
            session={active}
            title={title}
            onClose={nav.back}
            onWhoAmI={() => nav.push({ kind: 'whoami' })}
            onSettings={() => nav.push({ kind: 'settings' })}
            onOpenMedia={(item) => {
              const idx = viewable().findIndex((v) => v.msgId === item.msgId && v.attIndex === item.attIndex);
              if (idx >= 0) nav.push({ kind: 'media', index: idx });
            }}
            onGoToMessage={(id) => {
              nav.back();
              listRef.current?.scrollToMessage(id, { flash: true });
            }}
            onSave={prefs.rememberChats ? () => void persist(active.imported.source, active.imported.sourceKind) : undefined}
          />
        )}
      </div>
      {overlays}
    </>
  );
}

const versions = new WeakMap<object, number>();
let versionCounter = 0;
function rowsVersion(rows: object): number {
  let v = versions.get(rows);
  if (v === undefined) versions.set(rows, (v = ++versionCounter));
  return v;
}
