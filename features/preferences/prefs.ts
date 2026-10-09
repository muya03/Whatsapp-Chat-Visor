import type { TimeFormat } from '../../utils/format';

export type ThemePref = 'system' | 'light' | 'dark';
export type SkinPref = 'auto' | 'web' | 'android' | 'ios';

export interface Prefs {
  theme: ThemePref;
  skin: SkinPref;
  timeFormat: TimeFormat;
  /** Mostrar el nombre del remitente sobre cada grupo de mensajes en chats individuales. */
  showNamesInPrivate: boolean;
  /** Consentimiento explícito para guardar conversaciones en este dispositivo (IndexedDB). Desactivado por defecto. */
  rememberChats: boolean;
  installHintDismissed: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  skin: 'auto',
  timeFormat: 'auto',
  showNamesInPrivate: false,
  rememberChats: false,
  installHintDismissed: false,
};

const KEY = 'wv:prefs';

/** Solo se persisten preferencias de apariencia; nunca contenido de chats ni nombres de participantes. */
export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      theme: p.theme === 'light' || p.theme === 'dark' ? p.theme : 'system',
      skin: p.skin === 'web' || p.skin === 'android' || p.skin === 'ios' ? p.skin : 'auto',
      timeFormat: p.timeFormat === '12' || p.timeFormat === '24' ? p.timeFormat : 'auto',
      showNamesInPrivate: p.showNamesInPrivate === true,
      rememberChats: p.rememberChats === true,
      installHintDismissed: p.installHintDismissed === true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* almacenamiento bloqueado o lleno: la preferencia solo vale para esta sesión */
  }
}

export function detectSkin(isMobile: boolean): 'web' | 'android' | 'ios' {
  if (!isMobile) return 'web';
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return iOS ? 'ios' : 'android';
}
