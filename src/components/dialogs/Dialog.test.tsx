import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../../app/state/store';
import { NavProvider } from '../../app/state/nav';
import { Menu } from '../layout/Menu';
import { ToastProvider } from '../layout/Toast';
import { Dialog } from './Dialog';

const wrap = (ui: React.ReactNode) => (
  <ToastProvider>
    <NavProvider>
      <AppProvider>{ui}</AppProvider>
    </NavProvider>
  </ToastProvider>
);

function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>abrir</button>
      {open && (
        <Dialog title="Prueba" onClose={() => { setOpen(false); onClose(); }} actions={<button>Aceptar</button>}>
          <input aria-label="campo" />
        </Dialog>
      )}
    </>
  );
}

describe('Dialog', () => {
  it('rol y nombre accesibles, foco dentro, Tab lo mantiene atrapado, Escape cierra y devuelve el foco', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(wrap(<Harness onClose={onClose} />));
    const opener = screen.getByRole('button', { name: 'abrir' });
    await user.click(opener);
    const dlg = screen.getByRole('dialog', { name: 'Prueba' });
    expect(dlg).toHaveAttribute('aria-modal', 'true');
    expect(dlg.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dlg.contains(document.activeElement)).toBe(true);
    }
    await user.tab({ shift: true });
    expect(dlg.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });
});

describe('Menu', () => {
  it('flechas, selección con Enter y cierre con Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const a = vi.fn();
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    render(
      wrap(
        <Menu
          anchor={anchor}
          label="Opciones"
          onClose={onClose}
          items={[
            { id: 'a', label: 'Uno', onSelect: a },
            { id: 'b', label: 'Dos' },
            { id: 'c', label: 'Tres', disabled: true },
          ]}
        />,
      ),
    );
    expect(screen.getByRole('menu', { name: 'Opciones' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Uno' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Dos' })).toHaveFocus();
    await user.keyboard('{ArrowDown}'); // salta el deshabilitado y vuelve al primero
    expect(screen.getByRole('menuitem', { name: 'Uno' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(a).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByRole('menuitem', { name: 'Tres' })).toBeDisabled();
  });
});
