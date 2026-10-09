import { useState } from 'react';
import type { ZipEntryInfo } from '../../services/zipReader';
import { formatBytes } from '../../utils/format';
import { Dialog } from '../dialogs/Dialog';

interface Props {
  candidates: ZipEntryInfo[];
  onChoose(entry: ZipEntryInfo): void;
  onCancel(): void;
}

/** El ZIP contiene varios .txt: se pide elegir cuál es la conversación. */
export function EntryPicker({ candidates, onChoose, onCancel }: Props) {
  const [sel, setSel] = useState(0);
  return (
    <Dialog
      title="¿Qué conversación quieres abrir?"
      onClose={onCancel}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancelar</button>
          <button type="button" className="btn btn--primary" data-autofocus onClick={() => onChoose(candidates[sel]!)}>Abrir</button>
        </>
      }
    >
      <p>Este ZIP contiene {candidates.length} archivos de texto. Elige el que corresponde al chat.</p>
      <div className="radio-list" role="radiogroup" aria-label="Archivos de texto del ZIP">
        {candidates.map((c, i) => (
          <button key={c.path} type="button" role="radio" aria-checked={sel === i} className="radio" onClick={() => setSel(i)}>
            <span className="radio__dot" />
            <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }} dir="auto">
              {c.path}
              <small>{formatBytes(c.size)}</small>
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
