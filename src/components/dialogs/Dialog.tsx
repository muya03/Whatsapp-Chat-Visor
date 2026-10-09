import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useApp } from '../../app/state/store';
import { useEscape } from '../../app/state/hooks';
import { Icon } from '../Icon';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
  /** `peek`: scrim muy suave para ver el cambio en la conversación mientras se elige. */
  variant?: 'default' | 'peek';
  /** Evita cerrar al tocar fuera (p. ej. mientras hay una operación en curso). */
  dismissable?: boolean;
  hideClose?: boolean;
}

const FOCUSABLE = 'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';

/** Diálogo modal accesible: foco atrapado y restaurado, Escape, cierre al tocar fuera; hoja inferior en móvil. */
export function Dialog({ title, onClose, children, actions, wide, variant = 'default', dismissable = true, hideClose }: Props) {
  const { isMobile } = useApp();
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEscape(() => dismissable && onClose());

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const target = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(FOCUSABLE) ?? el;
    target?.focus({ preventScroll: true });
    return () => prev?.focus?.({ preventScroll: true });
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const nodes = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (nodes.length === 0) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={`scrim${isMobile ? ' scrim--sheet' : ''}`}
      style={variant === 'peek' ? { background: 'rgba(11,20,26,0.18)' } : undefined}
      onMouseDown={(e) => dismissable && e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        className={`dialog${wide ? ' dialog--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="dialog__head">
          <h2 id={titleId} className="dialog__title">
            {title}
          </h2>
          {!hideClose && (
            <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose} disabled={!dismissable}>
              <Icon name="close" />
            </button>
          )}
        </div>
        <div className="dialog__body">{children}</div>
        {actions && <div className="dialog__actions">{actions}</div>}
      </div>
    </div>
  );
}
