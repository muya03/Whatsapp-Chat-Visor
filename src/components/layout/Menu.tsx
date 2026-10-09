import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useEscape } from '../../app/state/hooks';
import { Icon, type IconName } from '../Icon';

export interface MenuItem {
  id: string;
  label: string;
  icon?: IconName;
  onSelect?: () => void;
  disabled?: boolean;
  checked?: boolean;
  separatorBefore?: boolean;
}

interface Props {
  anchor: HTMLElement | null;
  items: MenuItem[];
  onClose: () => void;
  label: string;
}

/** Menú contextual anclado a un botón: se cierra al tocar fuera, con Escape o al elegir; navegable con flechas. */
export function Menu({ anchor, items, onClose, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  useEscape(onClose);

  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    setPos({ top: Math.min(r.bottom + 2, window.innerHeight - 80), right: Math.max(8, window.innerWidth - r.right) });
  }, [anchor]);

  useLayoutEffect(() => {
    // Mantiene el menú dentro de la pantalla si es más alto que el espacio disponible.
    const el = ref.current;
    if (!el || !pos) return;
    const h = el.getBoundingClientRect().height;
    const maxTop = Math.max(8, window.innerHeight - h - 8);
    if (pos.top > maxTop) setPos({ ...pos, top: maxTop });
  }, [pos]);

  const placed = pos !== null;
  useEffect(() => {
    if (!placed) return;
    // El foco entra en el menú en cuanto aparece (accesible con teclado y lector de pantalla).
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [placed]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  const onKey = (e: React.KeyboardEvent) => {
    const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      btns[(i + 1) % btns.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      btns[(i - 1 + btns.length) % btns.length]?.focus();
    } else if (e.key === 'Tab') onClose();
  };

  if (!pos) return null;
  return (
    <div ref={ref} className="menu" role="menu" aria-label={label} style={{ top: pos.top, right: pos.right }} onKeyDown={onKey}>
      {items.map((it) => (
        <div key={it.id} role="none">
          {it.separatorBefore && <div className="menu__sep" role="separator" />}
          <button
            type="button"
            role={it.checked === undefined ? 'menuitem' : 'menuitemradio'}
            aria-checked={it.checked}
            className="menu__item"
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onSelect?.();
            }}
          >
            {it.icon && <Icon name={it.icon} size={20} />}
            <span>{it.label}</span>
            {it.checked && <Icon name="check" size={18} className="menu__check" />}
          </button>
        </div>
      ))}
    </div>
  );
}

/** Botón que abre un menú; gestiona su estado de apertura. */
export function MenuButton({
  label,
  icon,
  items,
  disabled,
  children,
}: {
  label: string;
  icon: IconName;
  items: MenuItem[];
  disabled?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="icon-btn"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={icon} />
      </button>
      {children}
      {open && <Menu anchor={btn.current} items={items} label={label} onClose={() => { setOpen(false); btn.current?.focus({ preventScroll: true }); }} />}
    </>
  );
}
