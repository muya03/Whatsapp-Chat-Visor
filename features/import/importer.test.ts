// @vitest-environment node
import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { ImportError } from '../../services/fileValidation';
import { MediaStore } from '../../services/mediaStore';
import { fixture } from '../../tests/helpers/fixtures';
import { disposeImported, importFile } from './importer';

const mkZip = (files: Record<string, Uint8Array | string>, name = 'Chat de WhatsApp con Ana.zip') => {
  const input: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) input[k] = typeof v === 'string' ? strToU8(v) : v;
  const bytes = zipSync(input, { level: 1 });
  return new File([bytes as BlobPart], name, { type: 'application/zip' });
};
const mkTxt = (text: string, name = '_chat.txt') => new File([text], name, { type: 'text/plain' });
const expectCode = async (p: Promise<unknown>, code: string) => {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(ImportError);
  expect((err as ImportError).code).toBe(code);
};

describe('importFile · TXT', () => {
  it('importa un TXT y construye la conversación', async () => {
    const r = await importFile(mkTxt(fixture('android-es-group.txt')));
    expect(r.sourceKind).toBe('txt');
    expect(r.chat.participants.map((p) => p.name)).toContain('Ana');
    expect((await r.client.stats()).messageCount).toBeGreaterThan(5);
    expect(r.media.count).toBe(0);
    disposeImported(r);
  });

  it('el motor busca sobre toda la conversación, sin tildes ni mayúsculas', async () => {
    const r = await importFile(mkTxt(fixture('android-es-group.txt')));
    const hits = await r.client.search('PÁGINA');
    expect(hits.length).toBe(1);
    expect(r.chat.messages[hits[0]!]!.text).toContain('página');
    expect((await r.client.search('equipo fantasma')).length).toBeGreaterThanOrEqual(2); // grupo creado + asunto
    expect((await r.client.search('zzz-no-existe')).length).toBe(0);
    disposeImported(r);
  });

  it('archivo vacío', async () => {
    await expectCode(importFile(mkTxt('')), 'empty-file');
  });
  it('TXT no reconocido conserva información útil para el mensaje de error', async () => {
    await expectCode(importFile(mkTxt(fixture('garbage.txt'))), 'txt-not-recognized');
  });
  it('tipo no admitido (cabecera PNG)', async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])], 'foto.png', { type: 'image/png' });
    await expectCode(importFile(png), 'unsupported-type');
  });
  it('TXT en Windows-1252 (UTF-8 inválido) se importa y se avisa', async () => {
    const bytes = new Uint8Array([...strToU8('14/12/22, 9:00 - Ana: caf'), 0xe9, 0x0a]);
    const r = await importFile(new File([bytes], 'x.txt', { type: 'text/plain' }));
    expect(r.chat.messages[0]!.text).toBe('café');
    expect(r.chat.issues.some((i) => i.code === 'encoding-fallback')).toBe(true);
    disposeImported(r);
  });
});

describe('importFile · ZIP', () => {
  const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

  it('localiza el TXT en subcarpetas y enlaza adjuntos aunque cambien mayúsculas, tildes o ruta', async () => {
    const nfdName = 'Informe trimestral Ñandú.pdf'.normalize('NFD');
    const zip = mkZip({
      'Chat Ana/_chat.txt': fixture('media-android.txt'),
      'Chat Ana/IMG-20230110-WA0001.JPG': photo,
      'Chat Ana/media/PTT-20230110-WA0002.opus': new Uint8Array([1, 2]),
      [`Chat Ana/${nfdName}`]: new Uint8Array([37, 80, 68, 70]),
    });
    const r = await importFile(zip);
    expect(r.chatEntryName).toBe('Chat Ana/_chat.txt');
    expect(r.media.count).toBe(3);
    const img = r.media.resolve('IMG-20230110-WA0001.jpg');
    expect(img?.mime).toBe('image/jpeg');
    expect(img?.size).toBe(photo.length);
    expect(r.media.resolve('PTT-20230110-WA0002.opus')?.name).toBe('PTT-20230110-WA0002.opus');
    expect(r.media.resolve('Informe trimestral Ñandú.pdf')).not.toBeNull(); // NFC vs NFD
    expect(r.media.resolve('IMG-20230110-WA0099.jpg')).toBeNull(); // adjunto ausente
    const blob = await r.mediaStore.getBlob(img!);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(photo);
    disposeImported(r);
  });

  it('varios TXT candidatos → pide elegir', async () => {
    const zip = mkZip({ 'a/_chat.txt': fixture('ios-en-pair.txt'), 'b/otro.txt': fixture('android-es-group.txt') });
    const choose = vi.fn(async (c: { path: string }[]) => c.find((x) => x.path === 'b/otro.txt')!);
    const r = await importFile(zip, { chooseEntry: choose as never });
    expect(choose).toHaveBeenCalledOnce();
    expect(r.chatEntryName).toBe('b/otro.txt');
    disposeImported(r);
  });

  it('cancelar la elección cancela la importación', async () => {
    const zip = mkZip({ 'a.txt': fixture('ios-en-pair.txt'), 'b.txt': fixture('ios-en-pair.txt') });
    await expectCode(importFile(zip, { chooseEntry: async () => null }), 'cancelled');
  });

  it('ZIP sin chat', async () => {
    await expectCode(importFile(mkZip({ 'foto.jpg': photo })), 'zip-no-chat');
  });

  it('ZIP dañado', async () => {
    const good = mkZip({ '_chat.txt': fixture('ios-en-pair.txt') });
    const bytes = new Uint8Array(await good.arrayBuffer());
    const corrupt = new File([bytes.slice(0, 4), new Uint8Array(50)], 'roto.zip', { type: 'application/zip' });
    await expectCode(importFile(corrupt), 'zip-corrupt');
  });

  it('ignora entradas con path traversal y archivos de macOS', async () => {
    const zip = mkZip({
      '_chat.txt': fixture('ios-en-pair.txt'),
      '../../evil.jpg': photo,
      '__MACOSX/._chat.txt': 'x',
    });
    const r = await importFile(zip);
    expect(r.notes.find((n) => n.code === 'zip-unsafe-entries')?.count).toBe(1);
    expect(r.media.count).toBe(0);
    disposeImported(r);
  });

  it('aborta con AbortSignal', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expectCode(importFile(mkTxt(fixture('ios-en-pair.txt')), { signal: ctrl.signal }), 'cancelled');
  });

  it('informa progreso en orden creciente', async () => {
    const ratios: number[] = [];
    const r = await importFile(mkZip({ '_chat.txt': fixture('ios-en-pair.txt') }), { onProgress: (p) => ratios.push(p.ratio) });
    expect([...ratios].sort((a, b) => a - b)).toEqual(ratios);
    expect(ratios.at(-1)).toBe(1);
    disposeImported(r);
  });
});

describe('MediaStore', () => {
  const file = (key: string, size = 10) => ({
    key,
    name: key,
    size,
    mime: 'image/png',
    load: vi.fn(async () => new Blob([new Uint8Array(size)])),
  });

  it('crea la URL una vez, cuenta referencias y la revoca al eliminar', async () => {
    const store = new MediaStore();
    const f = file('a');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const [h1, h2] = await Promise.all([store.acquire(f), store.acquire(f)]);
    expect(h1.url).toBe(h2.url);
    expect(f.load).toHaveBeenCalledTimes(1);
    store.dispose();
    expect(revoke).toHaveBeenCalledWith(h1.url);
    expect(store.liveUrlCount).toBe(0);
  });

  it('descarta peticiones en cola que ya nadie espera', async () => {
    const store = new MediaStore();
    const files = Array.from({ length: 8 }, (_, i) => file(`f${i}`));
    const pending = files.map((f) => store.acquire(f).catch(() => null));
    // el usuario hace scroll: libera las que aún no han empezado
    for (const f of files.slice(4)) store.release(f);
    await Promise.all(pending);
    const loaded = files.filter((f) => f.load.mock.calls.length > 0).length;
    expect(loaded).toBeLessThan(8);
    store.dispose();
  });

  it('un fallo permite reintentar', async () => {
    const store = new MediaStore();
    let n = 0;
    const f = { ...file('x'), load: vi.fn(async () => { if (n++ === 0) throw new Error('boom'); return new Blob(['ok']); }) };
    await expect(store.acquire(f)).rejects.toThrow('boom');
    await expect(store.acquire(f)).resolves.toMatchObject({ url: expect.any(String) });
    store.dispose();
  });
});
