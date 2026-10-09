import { es } from '../../i18n/es';
import { Avatar } from './Avatar';
import { Icon } from '../Icon';
import { MenuButton, type MenuItem } from './Menu';
import { SearchField } from '../search/SearchField';
import type { SearchApi } from '../../features/search/useSearch';

interface Props {
  title: string;
  subtitle: string;
  isGroup: boolean;
  avatarUrl: string | null;
  isMobile: boolean;
  showBack: boolean;
  search: SearchApi;
  /** En móvil la búsqueda sustituye a la cabecera, como en WhatsApp. */
  searchInHeader: boolean;
  onBack(): void;
  onInfo(): void;
  onDate(): void;
  menuItems: MenuItem[];
}

export function ChatHeader(p: Props) {
  if (p.searchInHeader && p.search.open) {
    return (
      <header className="hdr hdr--chat">
        <button type="button" className="icon-btn hdr__back" style={{ display: 'inline-grid' }} onClick={p.search.close} aria-label="Salir de la búsqueda">
          <Icon name="back" />
        </button>
        <SearchField search={p.search} autoFocus inHeader />
      </header>
    );
  }
  return (
    <header className="hdr hdr--chat">
      {p.showBack && (
        <button type="button" className="icon-btn hdr__back" onClick={p.onBack} aria-label={es.back}>
          <Icon name="back" />
        </button>
      )}
      <button type="button" className="hdr__main" onClick={p.onInfo} aria-label={`${es.info}: ${p.title}`}>
        <Avatar size={40} group={p.isGroup} src={p.avatarUrl} />
        <span className="hdr__text">
          <span className="hdr__title truncate" dir="auto">
            {p.title}
          </span>
          <span className="hdr__sub truncate" dir="auto">
            {p.subtitle}
          </span>
        </span>
      </button>
      <div className="hdr__actions">
        {!p.isMobile && (
          <button type="button" className="icon-btn" onClick={p.search.openSearch} aria-label={es.search} title={`${es.search} (Ctrl+F)`} aria-pressed={p.search.open}>
            <Icon name="search" />
          </button>
        )}
        {p.isMobile && (
          <button type="button" className="icon-btn" onClick={p.search.openSearch} aria-label={es.search} title={es.search}>
            <Icon name="search" />
          </button>
        )}
        <button type="button" className="icon-btn" onClick={p.onDate} aria-label={es.goToDate} title={es.goToDate}>
          <Icon name="calendar" />
        </button>
        <MenuButton label={es.menu} icon="more" items={p.menuItems} />
      </div>
    </header>
  );
}
