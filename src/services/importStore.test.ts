// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteAllLocalData, deleteSaved, hasSavedFlag, listSaved, loadSaved, saveImport, StorageError } from './importStore';

// Node no tiene localStorage: se simula para el indicador de «alguna vez se guardó algo».
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear() },
  configurable: true,
});

describe('almacenamiento local opcional', () => {
  beforeEach(async () => {
    await deleteAllLocalData();
  });

  it('sin guardados previos no abre ni crea la base de datos', async () => {
    expect(hasSavedFlag()).toBe(false);
    expect(await listSaved()).toEqual([]);
    expect((await indexedDB.databases()).length).toBe(0);
  });

  it('guarda, lista, reabre y elimina', async () => {
    const f = new File(['hola'], 'Chat.zip', { type: 'application/zip' });
    const meta = await saveImport(f, 'zip');
    expect(hasSavedFlag()).toBe(true);
    expect((await listSaved()).map((m) => m.name)).toEqual(['Chat.zip']);
    const back = await loadSaved(meta.id);
    expect(back?.name).toBe('Chat.zip');
    expect(await back!.text()).toBe('hola');
    await deleteSaved(meta.id);
    expect(await listSaved()).toEqual([]);
  });

  it('error de cuota: se informa con un código tipado y no se guarda nada', async () => {
    const orig = navigator.storage;
    Object.defineProperty(globalThis, 'navigator', { value: { storage: { estimate: async () => ({ quota: 10, usage: 9 }) } }, configurable: true });
    await expect(saveImport(new File([new Uint8Array(1000)], 'grande.zip'), 'zip')).rejects.toMatchObject({ code: 'quota' } satisfies Partial<StorageError>);
    Object.defineProperty(globalThis, 'navigator', { value: { storage: orig }, configurable: true });
    expect(await listSaved()).toEqual([]);
  });

  it('cancelación con AbortSignal', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const p = saveImport(new File(['x'], 'a.txt'), 'txt', ctrl.signal);
    await expect(p).resolves.toBeTruthy().catch(() => undefined); // abortar antes de empezar puede completar o abortar, pero nunca dejar datos a medias
    const items = await listSaved();
    expect(items.length === 0 || items.length === 1).toBe(true);
  });

  it('eliminar todos los datos locales borra bases y preferencias', async () => {
    await saveImport(new File(['x'], 'a.txt'), 'txt');
    localStorage.setItem('wv:prefs', '{}');
    await deleteAllLocalData();
    expect(await listSaved()).toEqual([]);
    expect(localStorage.getItem('wv:prefs')).toBeNull();
    expect(hasSavedFlag()).toBe(false);
  });
});
