import { useMemo, useState } from 'react';
import type { Session } from '../../app/state/store';
import { Icon } from '../Icon';

interface Notice {
  id: string;
  text: string;
  action?: { label: string; run: () => void };
}

interface Props {
  session: Session;
  onFixDate(): void;
  onDetails(): void;
}

/** Aviso discreto sobre la calidad de la importación: qué ha pasado, qué se recuperó y cómo corregirlo. */
export function NoticeBar({ session, onFixDate, onDetails }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const notices = useMemo(() => {
    const { chat, imported } = session;
    const list: Notice[] = [];
    const issue = (code: string) => chat.issues.find((i) => i.code === code);
    const order = { DMY: 'día/mes/año', MDY: 'mes/día/año', YMD: 'año/mes/día' }[chat.dateOrder];
    if (chat.dateOrderAmbiguous && session.dateOrderSetting === 'auto')
      list.push({ id: 'amb', text: `Las fechas de este chat son ambiguas: se han leído como ${order}. Si no es correcto, puedes cambiarlo.`, action: { label: 'Corregir', run: onFixDate } });
    if (issue('inconsistent-date-order'))
      list.push({ id: 'inc', text: 'Las fechas mezclan formatos distintos; algunas pueden estar mal interpretadas.', action: { label: 'Corregir', run: onFixDate } });
    const inv = issue('invalid-date');
    const cal = issue('unsupported-calendar');
    if (inv || cal)
      list.push({ id: 'inv', text: `${(inv?.count ?? 0) + (cal?.count ?? 0)} mensajes tienen una fecha que no se pudo interpretar; se muestran con la hora original del archivo.`, action: { label: 'Detalles', run: onDetails } });
    const rec = chat.recoveredLines;
    if (rec > 0)
      list.push({ id: 'rec', text: `${rec} líneas no encajaban con ningún mensaje; se han conservado dentro del mensaje anterior o al principio del chat.`, action: { label: 'Detalles', run: onDetails } });
    if (issue('encoding-fallback')) list.push({ id: 'enc', text: 'El archivo no estaba en UTF-8: se leyó como Windows-1252 y algunos caracteres podrían verse mal.' });
    for (const n of imported.notes) {
      if (n.code === 'zip-no-media') list.push({ id: 'nomedia', text: 'El ZIP no contiene archivos adjuntos: solo se muestra el texto.' });
      if (n.code === 'zip-truncated') list.push({ id: 'trunc', text: `El ZIP tiene más de ${n.count?.toLocaleString('es')} archivos: se indexaron solo los primeros.` });
      if (n.code === 'zip-unsafe-entries') list.push({ id: 'unsafe', text: `Se ignoraron ${n.count} entradas del ZIP con rutas no seguras.` });
    }
    return list;
  }, [session, onFixDate, onDetails]);

  const shown = notices.find((n) => !dismissed.has(n.id));
  if (!shown) return null;
  return (
    <div className="notice notice--inline" role="status" style={{ alignItems: 'center', position: 'relative', zIndex: 3 }}>
      <Icon name="info" />
      <span style={{ flex: 1 }}>{shown.text}</span>
      {shown.action && (
        <button type="button" className="linklike" style={{ fontWeight: 600, color: 'inherit', textDecoration: 'underline' }} onClick={shown.action.run}>
          {shown.action.label}
        </button>
      )}
      <button type="button" className="icon-btn" style={{ width: 28, height: 28, color: 'inherit' }} aria-label="Descartar aviso" onClick={() => setDismissed((d) => new Set(d).add(shown.id))}>
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}
