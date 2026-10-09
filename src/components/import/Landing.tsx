import { useRef, useState } from 'react';
import type { ImportProgress } from '../../features/import/importer';
import { es } from '../../i18n/es';
import { ImportError } from '../../services/fileValidation';
import type { SavedMeta } from '../../services/importStore';
import { LIMITS } from '../../services/limits';
import { formatBytes } from '../../utils/format';
import { Icon } from '../Icon';
import { describeImportError, STAGE_LABEL } from './importMessages';

export type ImportUi =
  | { phase: 'idle' }
  | { phase: 'working'; fileName: string; progress: ImportProgress }
  | { phase: 'error'; error: ImportError; fileName: string };

interface Props {
  ui: ImportUi;
  hasSessions: boolean;
  saved: SavedMeta[];
  onFiles(files: FileList | File[]): void;
  onCancel(): void;
  onBack(): void;
  onSettings(): void;
  onOpenSaved(id: string): void;
  onDeleteSaved(id: string): void;
  installSlot?: React.ReactNode;
}

export function Landing({ ui, hasSessions, saved, onFiles, onCancel, onBack, onSettings, onOpenSaved, onDeleteSaved, installSlot }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const pick = () => input.current?.click();

  return (
    <div className="landing" onDragOver={(e) => e.preventDefault()}>
      <div className="landing__bar">
        {hasSessions && (
          <button type="button" className="icon-btn" onClick={onBack} aria-label="Volver a la conversación" title="Volver a la conversación">
            <Icon name="back" />
          </button>
        )}
        <span className="landing__brand">
          <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width={30} height={30} />
          {es.appName}
        </span>
        <span className="spacer" />
        <button type="button" className="icon-btn" onClick={onSettings} aria-label={es.settings} title={es.settings}>
          <Icon name="settings" />
        </button>
      </div>

      <div className="landing__scroll scroll">
        <div className="landing__col">
          <div>
            <h1>Lee un chat exportado con su aspecto original</h1>
            <p className="landing__lead">
              Abre el archivo <strong>.txt</strong> o <strong>.zip</strong> que genera WhatsApp al exportar un chat y recorre la conversación con fechas, adjuntos y búsqueda, como si estuvieras en la aplicación.
            </p>
          </div>

          {ui.phase === 'working' ? (
            <div className="progress" role="status" aria-live="polite">
              <div className="spinner" />
              <div className="progress__stage">{STAGE_LABEL[ui.progress.stage] ?? 'Procesando…'}</div>
              <div className="progress__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ui.progress.ratio * 100)} aria-label="Progreso de la importación">
                <i style={{ width: `${Math.max(3, Math.round(ui.progress.ratio * 100))}%` }} />
              </div>
              <div className="progress__file" dir="auto">{ui.fileName}</div>
              <button type="button" className="btn btn--outline" onClick={onCancel}>Cancelar</button>
            </div>
          ) : (
            <>
              {ui.phase === 'error' && <ErrorBox error={ui.error} fileName={ui.fileName} onRetry={pick} onBack={hasSessions ? onBack : undefined} />}
              <div
                className="drop"
                data-over={over}
                onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(false);
                  if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
                }}
              >
                <span className="drop__icon"><Icon name="upload" /></span>
                <div className="drop__title">Arrastra aquí tu archivo</div>
                <button type="button" className="btn btn--primary" onClick={pick} data-testid="pick-file">Seleccionar archivo</button>
                <div className="drop__hint">
                  Formatos admitidos: TXT o ZIP (con multimedia). Texto del chat de hasta {formatBytes(LIMITS.maxTxtBytes)}; los ZIP grandes se leen por partes, sin cargarlos enteros en memoria.
                </div>
                <input
                  ref={input}
                  type="file"
                  data-testid="file-input"
                  accept=".txt,.zip,text/plain,application/zip,application/x-zip-compressed"
                  aria-label="Seleccionar archivo de chat (TXT o ZIP)"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) onFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </div>
            </>
          )}

          <ul className="facts">
            <li><Icon name="lock" /><span><strong>Todo ocurre en tu dispositivo.</strong> El archivo no se sube a ningún servidor ni se guarda al cerrar la pestaña (a menos que tú lo actives en Ajustes).</span></li>
            <li><Icon name="info" /><span>Esta herramienta <strong>no accede a tu cuenta de WhatsApp</strong> ni recupera mensajes que no estén en el archivo exportado. No es una aplicación de mensajería: no envía ni recibe nada.</span></li>
            <li><Icon name="download" /><span>Una vez cargada, <strong>funciona sin conexión</strong> y puedes instalarla como aplicación.</span></li>
          </ul>

          {installSlot}

          {saved.length > 0 && (
            <section className="saved" aria-label="Importaciones guardadas en este dispositivo">
              <h2>Guardadas en este dispositivo</h2>
              {saved.map((s) => (
                <div className="list-row" key={s.id}>
                  <span dir="auto">{s.name}<small>{formatBytes(s.size)} · guardado el {new Date(s.savedAt).toLocaleDateString('es')}</small></span>
                  <button type="button" className="btn btn--ghost" onClick={() => onOpenSaved(s.id)} disabled={ui.phase === 'working'}>Abrir</button>
                  <button type="button" className="icon-btn" onClick={() => onDeleteSaved(s.id)} aria-label={`Eliminar ${s.name}`} title="Eliminar"><Icon name="trash" size={20} /></button>
                </div>
              ))}
            </section>
          )}

          <details className="howto">
            <summary>Cómo exportar un chat desde WhatsApp</summary>
            <div className="howto__body">
              <div>
                <h3>En Android</h3>
                <ol>
                  <li>Abre el chat y toca ⋮ (más opciones).</li>
                  <li>Elige <em>Más</em> → <em>Exportar chat</em>.</li>
                  <li>Selecciona <em>Incluir multimedia</em> (ZIP con fotos, audios…) o <em>Sin multimedia</em> (solo texto).</li>
                  <li>Guárdalo o compártelo contigo mismo y ábrelo aquí.</li>
                </ol>
              </div>
              <div>
                <h3>En iPhone</h3>
                <ol>
                  <li>Abre el chat y toca el nombre del contacto o grupo.</li>
                  <li>Desplázate hasta <em>Exportar chat</em>.</li>
                  <li>Elige <em>Adjuntar archivos</em> o <em>Sin archivos</em>.</li>
                  <li>Guarda el ZIP en <em>Archivos</em> y selecciónalo aquí.</li>
                </ol>
              </div>
              <p>Los chats muy grandes con multimedia pueden pesar varios GB. Esta herramienta lee el ZIP sin descomprimirlo entero, pero la importación puede tardar.</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ error, fileName, onRetry, onBack }: { error: ImportError; fileName: string; onRetry(): void; onBack?: (() => void) | undefined }) {
  const c = describeImportError(error);
  return (
    <div className="errbox" role="alert">
      <h2><Icon name="warn" />{c.title}</h2>
      <p><strong dir="auto">{fileName}</strong>: {c.what}</p>
      {c.recovered && <p>{c.recovered}</p>}
      {c.steps.length > 0 && <ul>{c.steps.map((s) => <li key={s}>{s}</li>)}</ul>}
      <div className="errbox__actions">
        <button type="button" className="btn btn--primary" onClick={onRetry}>Elegir otro archivo</button>
        {onBack && <button type="button" className="btn btn--outline" onClick={onBack}>Volver a la conversación</button>}
      </div>
    </div>
  );
}
