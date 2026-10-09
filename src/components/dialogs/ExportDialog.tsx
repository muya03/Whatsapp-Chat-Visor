import { useMemo, useRef, useState } from 'react';
import { useApp, type Session } from '../../app/state/store';
import { buildExport, summarizeExport, type ExportMode } from '../../features/export/exportHtml';
import { downloadBlob } from '../../features/media/mediaUtils';
import { formatBytes } from '../../utils/format';
import { Icon } from '../Icon';
import { Dialog } from './Dialog';
import { useToast } from '../layout/Toast';

/** Por encima de este tamaño de adjuntos el ZIP se armaría en memoria: se desaconseja y se limita. */
const MAX_IN_MEMORY_ZIP = 1.5 * 1024 * 1024 * 1024;

export function ExportDialog({ session, title, onClose }: { session: Session; title: string; onClose(): void }) {
  const { prefs, resolvedTheme, resolvedSkin } = useApp();
  const { toast } = useToast();
  const summary = useMemo(() => summarizeExport(session), [session]);
  const [mode, setMode] = useState<ExportMode>('html');
  const [busy, setBusy] = useState<{ ratio: number; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const tooBig = mode === 'zip' && summary.availableBytes > MAX_IN_MEMORY_ZIP;

  const run = async () => {
    setError(null);
    const c = new AbortController();
    ctrl.current = c;
    setBusy({ ratio: 0, label: 'Preparando…' });
    try {
      const { blob, fileName } = await buildExport(session, {
        mode,
        title,
        theme: resolvedTheme,
        skin: resolvedSkin,
        timeFormat: prefs.timeFormat,
        signal: c.signal,
        onProgress: (ratio, label) => setBusy({ ratio, label }),
      });
      downloadBlob(blob, fileName);
      toast(`Exportado: ${fileName} (${formatBytes(blob.size)})`);
      onClose();
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') toast('Exportación cancelada.');
      else if (e instanceof RangeError) setError('No hay memoria suficiente para generar la copia. Prueba con «Solo HTML».');
      else setError('No se pudo generar la copia.');
      setBusy(null);
    }
  };

  return (
    <Dialog
      title="Exportar copia visual"
      onClose={() => (busy ? ctrl.current?.abort() : onClose())}
      dismissable={!busy}
      actions={
        busy ? (
          <button type="button" className="btn btn--outline" onClick={() => ctrl.current?.abort()}>Cancelar</button>
        ) : (
          <>
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cerrar</button>
            <button type="button" className="btn btn--primary" onClick={run} disabled={tooBig} data-autofocus>Exportar</button>
          </>
        )
      }
    >
      <p>Genera un archivo que se abre en cualquier navegador, con el mismo aspecto, el orden, las fechas, los remitentes y el formato de texto. Se crea en tu dispositivo; nada se envía a ningún servidor.</p>
      <div className="radio-list" role="radiogroup" aria-label="Tipo de exportación">
        <button type="button" role="radio" aria-checked={mode === 'html'} className="radio" onClick={() => setMode('html')} disabled={!!busy}>
          <span className="radio__dot" />
          <span style={{ flex: 1 }}>Solo HTML<small>Un único archivo. Los adjuntos se sustituyen por una etiqueta con su nombre.</small></span>
        </button>
        <button type="button" role="radio" aria-checked={mode === 'zip'} className="radio" onClick={() => setMode('zip')} disabled={!!busy || summary.available === 0}>
          <span className="radio__dot" />
          <span style={{ flex: 1 }}>HTML con adjuntos (ZIP)<small>{summary.available > 0 ? `Incluye ${summary.available.toLocaleString('es')} archivos (${formatBytes(summary.availableBytes)}) en una carpeta «media».` : 'No hay adjuntos disponibles en esta importación.'}</small></span>
        </button>
      </div>
      {mode === 'html' && summary.attachmentsTotal > 0 && (
        <div className="notice"><Icon name="info" /><span>No se exportarán {summary.attachmentsTotal.toLocaleString('es')} adjuntos ({summary.available.toLocaleString('es')} disponibles, {summary.omitted.toLocaleString('es')} omitidos al exportar el chat y {summary.missing.toLocaleString('es')} que faltan en el ZIP).</span></div>
      )}
      {mode === 'zip' && (summary.omitted > 0 || summary.missing > 0) && (
        <div className="notice"><Icon name="info" /><span>{(summary.omitted + summary.missing).toLocaleString('es')} adjuntos no estaban en la exportación original y se mostrarán como etiqueta.</span></div>
      )}
      {tooBig && <div className="notice" role="alert"><Icon name="warn" /><span>Los adjuntos pesan más de {formatBytes(MAX_IN_MEMORY_ZIP)}; el ZIP se generaría en memoria y podría fallar. Exporta «Solo HTML» o un chat más pequeño.</span></div>}
      {error && <div className="notice" role="alert"><Icon name="warn" /><span>{error}</span></div>}
      {busy && (
        <div role="status" aria-live="polite" style={{ display: 'grid', gap: 8 }}>
          <div className="progress__bar" style={{ width: '100%' }} role="progressbar" aria-valuenow={Math.round(busy.ratio * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(3, busy.ratio * 100)}%` }} /></div>
          <span>{busy.label}</span>
        </div>
      )}
    </Dialog>
  );
}
