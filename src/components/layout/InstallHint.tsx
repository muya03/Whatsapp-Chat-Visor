import { useState } from 'react';
import { useApp } from '../../app/state/store';
import { useInstall } from '../../pwa/pwa';
import { Icon } from '../Icon';
import { Dialog } from '../dialogs/Dialog';

/** Indicación discreta (no bloquea la lectura) para instalar la app; se puede descartar. */
export function InstallHint() {
  const { prefs, setPrefs } = useApp();
  const inst = useInstall();
  const [help, setHelp] = useState(false);
  if (inst.standalone || prefs.installHintDismissed) return null;
  if (!inst.canPrompt && !inst.manualIOS) return null;
  return (
    <>
      <div className="banner" role="region" aria-label="Instalar aplicación">
        <Icon name="install" />
        <p>Instálala para abrirla como una app y usarla sin conexión.</p>
        {inst.canPrompt ? (
          <button type="button" className="btn btn--ghost" onClick={() => void inst.prompt()}>Instalar</button>
        ) : (
          <button type="button" className="btn btn--ghost" onClick={() => setHelp(true)}>Cómo</button>
        )}
        <button type="button" className="icon-btn" aria-label="No volver a mostrar" onClick={() => setPrefs({ installHintDismissed: true })}>
          <Icon name="close" size={20} />
        </button>
      </div>
      {help && <InstallHelp onClose={() => setHelp(false)} />}
    </>
  );
}

export function InstallHelp({ onClose }: { onClose(): void }) {
  return (
    <Dialog title="Instalar en el iPhone o iPad" onClose={onClose} actions={<button type="button" className="btn btn--primary" onClick={onClose}>Entendido</button>}>
      <ol style={{ margin: 0, paddingInlineStart: 20, display: 'grid', gap: 8 }}>
        <li>Abre esta página en <strong>Safari</strong>.</li>
        <li>Toca el botón <strong>Compartir</strong> <Icon name="share" size={18} style={{ display: 'inline', verticalAlign: '-3px' }} />.</li>
        <li>Elige <strong>Añadir a pantalla de inicio</strong> y confirma.</li>
      </ol>
      <p>Después se abrirá a pantalla completa y funcionará sin conexión.</p>
    </Dialog>
  );
}
