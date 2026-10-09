import { useMemo, useState } from 'react';
import { nearestDay } from '../../features/conversation/rows';
import { formatDateLong, formatMonth } from '../../utils/format';
import { Icon } from '../Icon';
import { Dialog } from './Dialog';

interface Props {
  days: number[];
  onJump(dayKey: number): void;
  onJumpEnd(): void;
  onClose(): void;
}

const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const key = (y: number, m0: number, d: number) => y * 10000 + (m0 + 1) * 100 + d;

/** Calendario con los días que tienen mensajes. Elegir uno sin mensajes explica por qué y ofrece el más cercano. */
export function DateJumpDialog({ days, onJump, onJumpEnd, onClose }: Props) {
  const daySet = useMemo(() => new Set(days), [days]);
  const first = days[0] ?? key(2020, 0, 1);
  const last = days[days.length - 1] ?? first;
  const [year, setYear] = useState(Math.floor(last / 10000));
  const [month, setMonth] = useState(Math.floor((last % 10000) / 100) - 1);
  const [empty, setEmpty] = useState<number | null>(null);

  const firstYear = Math.floor(first / 10000);
  const lastYear = Math.floor(last / 10000);
  const years: number[] = [];
  for (let y = firstYear; y <= lastYear; y++) years.push(y);

  const move = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 0) (m = 11), y--;
    if (m > 11) (m = 0), y++;
    if (y < firstYear || y > lastYear) return;
    setMonth(m);
    setYear(y);
  };

  const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  const near = empty !== null ? nearestDay(days, empty) : null;

  const pick = (d: number) => {
    const k = key(year, month, d);
    if (daySet.has(k)) onJump(k);
    else setEmpty(k);
  };

  return (
    <Dialog title="Ir a una fecha" onClose={onClose}>
      <div className="cal">
        <div className="cal__nav">
          <button type="button" className="icon-btn" onClick={() => move(-1)} aria-label="Mes anterior">
            <Icon name="left" />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="cal__title" aria-live="polite">
              {formatMonth(year, month)}
            </span>
          </div>
          <button type="button" className="icon-btn" onClick={() => move(1)} aria-label="Mes siguiente">
            <Icon name="right" />
          </button>
        </div>
        <div className="cal__grid" role="group" aria-label={formatMonth(year, month)}>
          {DOW.map((d, i) => (
            <span key={d} className="cal__dow" aria-hidden="true" data-dow={i}>
              {d}
            </span>
          ))}
          {cells.map((d, i) =>
            d === null ? (
              <span key={`b${i}`} />
            ) : (
              <button
                key={d}
                type="button"
                className="cal__day"
                aria-label={`${d} de ${formatMonth(year, month).toLowerCase()}${daySet.has(key(year, month, d)) ? ', hay mensajes' : ', sin mensajes'}`}
                style={daySet.has(key(year, month, d)) ? undefined : { background: 'transparent', color: 'var(--c-text-2)', fontWeight: 400 }}
                onClick={() => pick(d)}
              >
                {d}
              </button>
            ),
          )}
        </div>
        {years.length > 1 && (
          <div className="field">
            <label htmlFor="cal-year">Año</label>
            <select id="cal-year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {empty !== null && (
        <div className="notice" role="status">
          <Icon name="info" />
          <span>
            No hay mensajes el {formatDateLong(empty)}.
            {near !== null && (
              <>
                {' '}
                <button type="button" className="linklike" onClick={() => onJump(near)}>
                  Ir al {formatDateLong(near)}
                </button>
              </>
            )}
          </span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn--outline" onClick={() => onJump(first)}>
          Primer día
        </button>
        <button type="button" className="btn btn--outline" onClick={onJumpEnd}>
          Último mensaje
        </button>
      </div>
    </Dialog>
  );
}
