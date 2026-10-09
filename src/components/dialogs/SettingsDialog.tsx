import { useEffect, useRef, useState } from 'react';
import type { Session } from '../../app/state/store';
import { useApp } from '../../app/state/store';
import type { SkinPref, ThemePref } from '../../features/preferences/prefs';
import type { DateOrderSetting } from '../../parser/whatsapp/types';
import { deleteAllLocalData } from '../../services/importStore';
import type { TimeFormat } from '../../utils/format';
import { Icon } from '../Icon';
import { useToast } from '../layout/Toast';
import { Dialog } from './Dialog';

interface Props {
  session: Session | null;
  onClose(): void;
  onChangeDateOrder(setting: DateOrderSetting): void;
  onForgetAll(): void;
  focusDate?: boolean;
}

const THEMES: { id: ThemePref; label: string }[] = [
  { id: 'system', label: 'Predeterminado del sistema' },
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Oscuro' },
];

const ORDER_LABEL: Record<DateOrderSetting, string> = {
  auto: 'Detectar automáticamente',
  DMY: 'Día / mes / año',
  MDY: 'Mes / día / año',
  YMD: 'Año / mes / día',
};

export function SettingsDialog({ session, onClose, onChangeDateOrder, onForgetAll, focusDate }: Props) {
  const { prefs, setPrefs, patchSession, titleOf } = useApp();
  const { toast } = useToast();
  const [name, setName] = useState(session?.customTitle ?? '');
  const [consent, setConsent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (focusDate) dateRef.current?.focus();
  }, [focusDate]);

  const commitName = () => {
    if (!session) return;
    const v = name.trim();
    patchSession(session.id, { customTitle: v === '' ? null : v });
  };

  const pickAvatar = (file: File | undefined) => {
    if (!session || !file) return;
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
      toast('Elige una imagen de hasta 8 MB.');
      return;
    }
    if (session.avatarUrl) URL.revokeObjectURL(session.avatarUrl);
    patchSession(session.id, { avatarUrl: URL.createObjectURL(file) });
  };

  return (
    <>
      <Dialog title="Ajustes" wide onClose={() => { commitName(); onClose(); }} actions={<button type="button" className="btn btn--primary" onClick={() => { commitName(); onClose(); }}>Hecho</button>}>
        <section className="field" aria-labelledby="set-theme">
          <span className="label" id="set-theme">Tema</span>
          <div className="radio-list" role="radiogroup" aria-labelledby="set-theme">
            {THEMES.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={prefs.theme === t.id} className="radio" onClick={() => setPrefs({ theme: t.id })}>
                <span className="radio__dot" />
                {t.label}
              </button>
            ))}
          </div>
        </section>

        <div className="field">
          <label htmlFor="set-skin">Estilo de la interfaz</label>
          <select id="set-skin" value={prefs.skin} onChange={(e) => setPrefs({ skin: e.target.value as SkinPref })}>
            <option value="auto">Automático (según el dispositivo)</option>
            <option value="web">Escritorio (estilo web)</option>
            <option value="android">Android</option>
            <option value="ios">iPhone</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="set-time">Formato de hora</label>
          <select id="set-time" value={prefs.timeFormat} onChange={(e) => setPrefs({ timeFormat: e.target.value as TimeFormat })}>
            <option value="auto">El del archivo importado</option>
            <option value="24">24 horas</option>
            <option value="12">12 horas (a. m. / p. m.)</option>
          </select>
        </div>

        {session && (
          <>
            <hr style={{ border: 0, borderTop: '1px solid var(--c-border)', width: '100%' }} />
            <div className="field">
              <label htmlFor="set-name">Nombre de la conversación</label>
              <input id="set-name" type="text" value={name} placeholder={titleOf({ ...session, customTitle: null })} maxLength={120} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === 'Enter' && commitName()} />
            </div>
            <div className="field">
              <label htmlFor="set-me">Yo soy</label>
              <select id="set-me" value={session.me ?? ''} onChange={(e) => patchSession(session.id, { me: e.target.value === '' ? null : e.target.value })}>
                <option value="">Vista neutral (sin indicar)</option>
                {session.chat.participants.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="set-date">Orden de las fechas del archivo</label>
              <select id="set-date" ref={dateRef} value={session.dateOrderSetting} onChange={(e) => onChangeDateOrder(e.target.value as DateOrderSetting)}>
                {(Object.keys(ORDER_LABEL) as DateOrderSetting[]).map((k) => (
                  <option key={k} value={k}>{k === 'auto' ? `${ORDER_LABEL[k]} (ahora: ${ORDER_LABEL[session.chat.dateOrder].toLowerCase()})` : ORDER_LABEL[k]}</option>
                ))}
              </select>
              {session.chat.dateOrderAmbiguous && session.dateOrderSetting === 'auto' && (
                <div className="notice">
                  <Icon name="warn" />
                  <span>En este chat todos los días son ≤ 12, así que no hay forma segura de saber si el primer número es día o mes. Si las fechas se ven mal, elige el orden correcto: se aplicará al instante.</span>
                </div>
              )}
            </div>
            <div className="field">
              <span className="label">Avatar de la conversación (solo en este dispositivo)</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn--outline" onClick={() => fileRef.current?.click()}>Elegir imagen…</button>
                {session.avatarUrl && (
                  <button type="button" className="btn btn--ghost" onClick={() => { URL.revokeObjectURL(session.avatarUrl!); patchSession(session.id, { avatarUrl: null }); }}>Quitar</button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pickAvatar(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
          </>
        )}

        <div className="switch-row">
          <span id="sw-names">Mostrar el nombre del remitente también en chats individuales</span>
          <button type="button" role="switch" aria-checked={prefs.showNamesInPrivate} aria-labelledby="sw-names" className="switch" onClick={() => setPrefs({ showNamesInPrivate: !prefs.showNamesInPrivate })} />
        </div>

        <hr style={{ border: 0, borderTop: '1px solid var(--c-border)', width: '100%' }} />
        <section className="field" aria-labelledby="priv-h">
          <span className="label" id="priv-h">Privacidad y datos locales</span>
          <div className="switch-row">
            <span id="sw-remember">Recordar conversaciones en este dispositivo</span>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.rememberChats}
              aria-labelledby="sw-remember"
              className="switch"
              onClick={() => (prefs.rememberChats ? setPrefs({ rememberChats: false }) : setConsent(true))}
            />
          </div>
          <p style={{ fontSize: 13 }}>
            Desactivado por defecto: al cerrar la pestaña no queda nada. Todo se procesa en tu dispositivo y no se envía a ningún servidor.
          </p>
          <div>
            <button
              type="button"
              className="btn btn--danger btn--outline"
              onClick={async () => {
                await deleteAllLocalData();
                onForgetAll();
                toast('Se han eliminado las conversaciones guardadas y las preferencias.');
              }}
            >
              <Icon name="trash" size={18} /> Eliminar todos los datos locales
            </button>
          </div>
        </section>
      </Dialog>

      {consent && (
        <Dialog
          title="¿Guardar conversaciones en este dispositivo?"
          onClose={() => setConsent(false)}
          actions={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setConsent(false)}>Cancelar</button>
              <button type="button" className="btn btn--primary" data-autofocus onClick={() => { setPrefs({ rememberChats: true }); setConsent(false); }}>Activar</button>
            </>
          }
        >
          <p>Los archivos que importes (TXT o ZIP, incluidos fotos, audios y documentos) quedarán almacenados <strong>dentro de este navegador</strong>, sin cifrar, hasta que los elimines.</p>
          <p>Cualquier persona con acceso a este perfil del navegador podría abrirlos. Puedes ver, abrir y borrar lo guardado desde la pantalla de importación, y borrarlo todo desde estos ajustes.</p>
        </Dialog>
      )}
    </>
  );
}
