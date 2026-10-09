import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ImportError } from '../../services/fileValidation';
import type { SavedMeta } from '../../services/importStore';
import { Landing, type ImportUi } from './Landing';

const base = { hasSessions: false, saved: [] as SavedMeta[], onFiles: vi.fn(), onCancel: vi.fn(), onBack: vi.fn(), onSettings: vi.fn(), onOpenSaved: vi.fn(), onDeleteSaved: vi.fn() };
const view = (ui: ImportUi, over: Partial<typeof base> = {}) => render(<Landing ui={ui} {...base} {...over} />);

describe('pantalla de importación', () => {
  it('explica formatos, procesamiento local, instrucciones y que no accede a la cuenta', () => {
    view({ phase: 'idle' });
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/TXT o ZIP/)).toBeInTheDocument();
    expect(screen.getByText(/Todo ocurre en tu dispositivo/)).toBeInTheDocument();
    expect(screen.getByText(/no accede a tu cuenta/)).toBeInTheDocument();
    expect(screen.getByText('Cómo exportar un chat desde WhatsApp')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seleccionar archivo' })).toBeInTheDocument();
  });

  it('el selector de archivos entrega el archivo', async () => {
    const onFiles = vi.fn();
    view({ phase: 'idle' }, { onFiles });
    const file = new File(['x'], '_chat.txt', { type: 'text/plain' });
    await userEvent.upload(screen.getByTestId('file-input'), file);
    expect(onFiles).toHaveBeenCalledOnce();
    expect(onFiles.mock.calls[0]![0][0]).toBe(file);
  });

  it('arrastrar y soltar entrega el archivo', () => {
    const onFiles = vi.fn();
    const { container } = view({ phase: 'idle' }, { onFiles });
    const file = new File(['x'], 'a.zip');
    const drop = container.querySelector('.drop')!;
    fireEvent.dragEnter(drop, { dataTransfer: { files: [file] } });
    expect(drop).toHaveAttribute('data-over', 'true');
    fireEvent.drop(drop, { dataTransfer: { files: [file] } });
    expect(onFiles).toHaveBeenCalledOnce();
    expect(drop).toHaveAttribute('data-over', 'false');
  });

  it('muestra progreso con barra accesible y permite cancelar', async () => {
    const onCancel = vi.fn();
    view({ phase: 'working', fileName: 'chat.zip', progress: { stage: 'parse', ratio: 0.42 } }, { onCancel });
    expect(screen.getByRole('progressbar', { name: /Progreso/ })).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByText(/Analizando mensajes/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it.each([
    ['unsupported-type', /Formato de archivo no compatible/],
    ['empty-file', /vacío/],
    ['zip-corrupt', /dañado o incompleto/],
    ['zip-no-chat', /No hay ninguna conversación/],
    ['txt-not-recognized', /No se reconoce el formato/],
    ['too-large', /demasiado grande/],
    ['memory', /Memoria insuficiente/],
  ] as const)('error %s: explica qué pasó, cómo continuar y ofrece reintentar, sin trazas', (code, title) => {
    view({ phase: 'error', fileName: 'x.zip', error: new ImportError(code, { entries: 3, size: 10, limit: 5, lines: 9 }) });
    const box = screen.getByRole('alert');
    expect(box).toHaveTextContent(title);
    expect(box).toHaveTextContent('x.zip');
    expect(box).not.toHaveTextContent(/at \w+ \(|Error:|stack/i);
    expect(screen.getByRole('button', { name: 'Elegir otro archivo' })).toBeInTheDocument();
  });

  it('con conversaciones abiertas ofrece volver', async () => {
    const onBack = vi.fn();
    view({ phase: 'idle' }, { hasSessions: true, onBack });
    await userEvent.click(screen.getByRole('button', { name: /Volver a la conversación/ }));
    expect(onBack).toHaveBeenCalled();
  });

  it('lista las importaciones guardadas con abrir y eliminar', async () => {
    const onOpenSaved = vi.fn();
    const onDeleteSaved = vi.fn();
    view({ phase: 'idle' }, { saved: [{ id: '1', name: 'Chat A.zip', size: 2048, kind: 'zip', savedAt: 0 }], onOpenSaved, onDeleteSaved });
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    await userEvent.click(screen.getByRole('button', { name: /Eliminar Chat A.zip/ }));
    expect(onOpenSaved).toHaveBeenCalledWith('1');
    expect(onDeleteSaved).toHaveBeenCalledWith('1');
  });
});
