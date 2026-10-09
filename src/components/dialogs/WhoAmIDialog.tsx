import type { Session } from '../../app/state/store';
import { Dialog } from './Dialog';

interface Props {
  session: Session;
  onChange(me: string | null): void;
  onClose(): void;
}

/** «¿Quién eres?»: el cambio se aplica al instante en la conversación que se ve detrás (vista previa inmediata). */
export function WhoAmIDialog({ session, onChange, onClose }: Props) {
  const people = session.chat.participants;
  return (
    <Dialog
      title="¿Quién eres en esta conversación?"
      variant="peek"
      onClose={onClose}
      actions={
        <button type="button" className="btn btn--primary" onClick={onClose} data-autofocus>
          Hecho
        </button>
      }
    >
      <p>
        La exportación no indica quién la hizo. Elige tu nombre para ver tus mensajes a la derecha. Si no lo eliges, los mensajes se muestran en
        vista neutral, todos a la izquierda y con su remitente.
      </p>
      <div className="radio-list" role="radiogroup" aria-label="Participantes">
        {people.map((p) => (
          <button key={p.name} type="button" role="radio" aria-checked={session.me === p.name} className="radio" onClick={() => onChange(p.name)}>
            <span className="radio__dot" />
            <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }} dir="auto">
              {p.name}
              <small>{p.count.toLocaleString('es')} mensajes</small>
            </span>
          </button>
        ))}
        <button type="button" role="radio" aria-checked={session.me === null} className="radio" onClick={() => onChange(null)}>
          <span className="radio__dot" />
          <span style={{ flex: 1 }}>
            No quiero indicarlo
            <small>Vista neutral</small>
          </span>
        </button>
      </div>
    </Dialog>
  );
}
