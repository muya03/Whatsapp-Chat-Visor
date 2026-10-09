import { useApp, type Session } from '../../app/state/store';
import { conversationSubtitle } from '../../features/conversation/title';
import type { SearchApi } from '../../features/search/useSearch';
import { es } from '../../i18n/es';
import { formatDateShort } from '../../utils/format';
import { Icon } from '../Icon';
import { SearchField } from '../search/SearchField';
import { SearchResults } from '../search/SearchResults';
import { Avatar } from './Avatar';
import { MenuButton, type MenuItem } from './Menu';

interface Props {
  search: SearchApi;
  onSelect(id: string): void;
  onImport(): void;
  onOpenSettings(): void;
  onShowInstall?: (() => void) | undefined;
  onPickResult(messageId: number, cursor: number): void;
  hidden?: boolean;
}

/** Panel izquierdo (estilo WhatsApp Web): conversaciones importadas, búsqueda y accesos. En móvil es la «lista de chats». */
export function SidePanel({ search, onSelect, onImport, onOpenSettings, onShowInstall, onPickResult, hidden }: Props) {
  const { sessions, active, titleOf, removeSession, isMobile } = useApp();
  const menu: MenuItem[] = [
    { id: 'import', label: es.importAnother, icon: 'upload', onSelect: onImport },
    { id: 'settings', label: es.settings, icon: 'settings', onSelect: onOpenSettings },
    ...(onShowInstall ? [{ id: 'install', label: 'Instalar aplicación', icon: 'install' as const, onSelect: onShowInstall }] : []),
  ];
  const desktopSearch = !isMobile && active;

  return (
    <aside className="side" aria-label="Conversaciones" data-hidden={hidden || undefined} aria-hidden={hidden || undefined}>
      <header className="hdr">
        <div className="side__brand">
          <img className="side__logo" src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width={36} height={36} />
          <span className="truncate">{es.appName}</span>
        </div>
        <div className="hdr__actions">
          <button type="button" className="icon-btn" onClick={onImport} aria-label={es.importAnother} title={es.importAnother}>
            <Icon name="upload" />
          </button>
          <MenuButton label={es.menu} icon="more" items={menu} />
        </div>
      </header>

      {desktopSearch &&
        (search.open ? (
          <div className="side__search">
            <SearchField search={search} autoFocus />
          </div>
        ) : (
          <div className="side__search">
            <button type="button" className="searchbox" style={{ width: '100%', textAlign: 'start' }} onClick={search.openSearch} aria-label={es.searchPlaceholder}>
              <Icon name="search" size={20} />
              <span style={{ color: 'var(--c-text-2)', fontSize: 14 }}>{es.searchPlaceholder}</span>
            </button>
          </div>
        ))}

      <div className="side__body">
        {desktopSearch && search.open ? (
          <SearchResults search={search} messages={active!.chat.messages} onPick={onPickResult} />
        ) : (
          <ul className="scroll" style={{ height: '100%' }}>
            {sessions.map((s) => (
              <li key={s.id}>
                <ChatItem session={s} title={titleOf(s)} current={active?.id === s.id} onSelect={() => onSelect(s.id)} onClose={() => removeSession(s.id)} />
              </li>
            ))}
            {sessions.length === 0 && <p className="empty-note">No hay conversaciones abiertas.</p>}
          </ul>
        )}
      </div>

      <div className="side__foot">
        <span>{es.localNotice}</span>
        <button type="button" className="linklike" onClick={onImport}>
          {es.importAnother}
        </button>
      </div>
    </aside>
  );
}

function ChatItem({ session, title, current, onSelect, onClose }: { session: Session; title: string; current: boolean; onSelect(): void; onClose(): void }) {
  const sub = conversationSubtitle(session.chat, session.stats, formatDateShort, es.messagesCount);
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="chat-item" aria-current={current} onClick={onSelect}>
        <Avatar size={49} group={session.chat.isGroup} src={session.avatarUrl} />
        <span className="chat-item__text">
          <span className="chat-item__title truncate" dir="auto">
            {title}
          </span>
          <span className="chat-item__sub truncate" dir="auto">
            {session.chat.isGroup ? es.messagesCount(session.stats?.messageCount ?? session.chat.messages.length) : sub}
          </span>
        </span>
      </button>
      <button type="button" className="icon-btn chat-item__close" onClick={onClose} aria-label={`Cerrar conversación ${title}`} title="Cerrar conversación">
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}
