import { describe, expect, it } from 'vitest';
import { parseChat } from './parser';

const fmt = (ts: number | null) => (ts === null ? null : new Date(ts).toISOString().slice(0, 16));

/** Formatos regionales habituales. Se comprueban uno a uno; no se afirma compatibilidad con idiomas no cubiertos aquí. */
describe('formatos regionales de exportación', () => {
  const cases: { name: string; text: string; sender: string; msg: string; at: string; order?: string; hour12?: boolean }[] = [
    { name: 'es-ES Android 24 h', text: '14/12/22, 9:05 - Ana: hola', sender: 'Ana', msg: 'hola', at: '2022-12-14T09:05' },
    { name: 'es-MX Android 12 h con "a. m." / "p. m."', text: '14/12/2022 9:05 p. m. - Ana: hola\n15/12/2022 1:00 a. m. - Ana: x', sender: 'Ana', msg: 'hola', at: '2022-12-14T21:05', hour12: true },
    { name: 'en-US Android 12 h', text: '12/14/22, 9:05 PM - Ana: hi\n12/15/22, 12:00 AM - Ana: x', sender: 'Ana', msg: 'hi', at: '2022-12-14T21:05', order: 'MDY', hour12: true },
    { name: 'en-GB iOS', text: '[14/12/2022, 21:05:09] Ana: hi', sender: 'Ana', msg: 'hi', at: '2022-12-14T21:05', order: 'DMY' },
    { name: 'de-DE Android (puntos)', text: '14.12.22, 21:05 - Ana: Hallo', sender: 'Ana', msg: 'Hallo', at: '2022-12-14T21:05' },
    { name: 'de-DE iOS (puntos y corchetes)', text: '[14.12.22, 21:05:09] Ana: Hallo', sender: 'Ana', msg: 'Hallo', at: '2022-12-14T21:05' },
    { name: 'fr-FR Android', text: '14/12/2022 21:05 - Ana : Bonjour'.replace(' : ', ': '), sender: 'Ana', msg: 'Bonjour', at: '2022-12-14T21:05' },
    { name: 'it-IT Android', text: '14/12/22, 21:05 - Ana: Ciao', sender: 'Ana', msg: 'Ciao', at: '2022-12-14T21:05' },
    { name: 'pt-BR Android', text: '14/12/2022 21:05 - Ana: Olá', sender: 'Ana', msg: 'Olá', at: '2022-12-14T21:05' },
    { name: 'pt-PT iOS', text: '[14/12/2022, 21:05:09] Ana: Olá', sender: 'Ana', msg: 'Olá', at: '2022-12-14T21:05' },
    { name: 'nl-NL', text: '14-12-2022 21:05 - Ana: Hoi', sender: 'Ana', msg: 'Hoi', at: '2022-12-14T21:05' },
    { name: 'ja-JP (año primero)', text: '2022/12/14 21:05 - Ana: こんにちは', sender: 'Ana', msg: 'こんにちは', at: '2022-12-14T21:05', order: 'YMD' },
    { name: 'zh-CN iOS con periodo prefijado', text: '[2022/12/14 下午9:05:09] Ana: 你好', sender: 'Ana', msg: '你好', at: '2022-12-14T21:05', order: 'YMD', hour12: true },
    { name: 'espacio estrecho (U+202F) antes de PM en iOS reciente', text: '[12/14/22, 9:05:09 PM] Ana: hi\n[12/15/22, 8:00:00 AM] Ana: x', sender: 'Ana', msg: 'hi', at: '2022-12-14T21:05', hour12: true },
    { name: 'nombre con emoji y marcas bidi (iOS)', text: '‎[14/12/22, 21:05:09] ⁨Ana 🌸⁩: ‎hola', sender: 'Ana 🌸', msg: 'hola', at: '2022-12-14T21:05' },
    { name: 'BOM al inicio del archivo', text: '﻿14/12/22, 21:05 - Ana: hola', sender: 'Ana', msg: 'hola', at: '2022-12-14T21:05' },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const chat = parseChat(c.text);
      const m = chat.messages.find((x) => x.sender === c.sender)!;
      expect(m, JSON.stringify(chat.issues)).toBeTruthy();
      expect(m.text).toBe(c.msg);
      expect(fmt(m.ts)).toBe(c.at);
      if (c.order) expect(chat.dateOrder).toBe(c.order);
      if (c.hour12 !== undefined) expect(chat.sourceHour12).toBe(c.hour12);
    });
  }

  it('no desplaza horas: 00:00 y 23:59 se conservan sin zona horaria', () => {
    const chat = parseChat('01/06/23, 0:00 - A: a\n01/06/23, 23:59 - A: b\n');
    expect(chat.messages.map((m) => fmt(m.ts))).toEqual(['2023-06-01T00:00', '2023-06-01T23:59']);
  });
});

describe('avisos del sistema en varios idiomas', () => {
  const sys = (line: string) => parseChat(`14/12/22, 21:05 - ${line}\n`).messages[0]!;
  const table: [string, string][] = [
    ['Ana añadió a Beto', 'participant-added'],
    ['Ana added Beto', 'participant-added'],
    ['Ana hat Beto hinzugefügt', 'participant-added'],
    ['Ana ajouta Beto'.replace('ajouta', 'a ajouté'), 'participant-added'],
    ['Ana ha aggiunto Beto', 'participant-added'],
    ['Ana adicionou Beto', 'participant-added'],
    ['Beto salió del grupo', 'participant-left'],
    ['Beto left', 'participant-left'],
    ['Beto ha lasciato il gruppo', 'participant-left'],
    ['Ana eliminó a Beto', 'participant-removed'],
    ['Ana removed Beto', 'participant-removed'],
    ['Ana creó el grupo "Foo"', 'group-created'],
    ['Ana created group "Foo"', 'group-created'],
    ['Ana a créé le groupe « Foo »', 'group-created'],
    ['Ana cambió el asunto de "A" a "B"', 'subject-changed'],
    ['Ana changed the subject from "A" to "B"', 'subject-changed'],
    ['Ana cambió el icono de este grupo', 'icon-changed'],
    ['Ana cambió la descripción del grupo', 'description-changed'],
    ['Ana se unió usando el enlace de invitación a este grupo', 'joined-link'],
    ['Los mensajes y las llamadas están cifrados de extremo a extremo.', 'encryption'],
    ['Messages and calls are end-to-end encrypted.', 'encryption'],
    ['Nachrichten und Anrufe sind Ende-zu-Ende-verschlüsselt.', 'encryption'],
    ['El código de seguridad de Beto cambió.', 'security-code'],
  ];
  for (const [line, kind] of table) {
    it(`${kind}: ${line.slice(0, 48)}`, () => {
      const m = sys(line);
      expect(m.kind).toBe('system');
      expect(m.system).toBe(kind);
      expect(m.sender).toBeNull();
    });
  }

  it('un texto desconocido SIN remitente es aviso genérico, no se le inventa tipo', () => {
    expect(sys('Evento extraño que nadie conoce').system).toBe('other');
  });
  it('un mensaje normal que menciona palabras de aviso NO se convierte en aviso', () => {
    const m = parseChat('14/12/22, 21:05 - Ana: Beto left the building, added a note: ok\n').messages[0]!;
    expect(m.kind).toBe('text');
    expect(m.sender).toBe('Ana');
  });
  it('llamadas, mensajes eliminados y contenido omitido en varios idiomas', () => {
    const body = (b: string) => parseChat(`14/12/22, 21:05 - Ana: ${b}\n`).messages[0]!;
    expect(body('Llamada perdida').kind).toBe('call');
    expect(body('Missed voice call').kind).toBe('call');
    expect(body('Videollamada, 2 min').kind).toBe('call');
    expect(body('Anruf verpasst'.replace('Anruf verpasst', 'Verpasster Sprachanruf')).kind).toBe('call');
    expect(body('This message was deleted').kind).toBe('deleted');
    expect(body('Se eliminó este mensaje').kind).toBe('deleted');
    expect(body('Diese Nachricht wurde gelöscht').kind).toBe('deleted');
    expect(body('<Media omitted>').attachments[0]).toMatchObject({ omitted: true });
    expect(body('<Medien ausgeschlossen>').attachments[0]).toMatchObject({ omitted: true });
    expect(body('<Multimedia omitido>').attachments[0]).toMatchObject({ omitted: true });
    expect(body('imagen omitida').attachments[0]).toMatchObject({ omitted: true, kind: 'image' });
    expect(body('sticker omitido').attachments[0]).toMatchObject({ omitted: true, kind: 'sticker' });
    // y un mensaje que solo CONTIENE la palabra no se toca
    expect(body('la llamada perdida de ayer fue rara').kind).toBe('text');
  });
  it('adjuntos Android/iOS localizados', () => {
    const att = (b: string) => parseChat(`14/12/22, 21:05 - Ana: ${b}\n`).messages[0]!.attachments[0];
    expect(att('IMG-20221214-WA0001.jpg (archivo adjunto)')).toMatchObject({ kind: 'image' });
    expect(att('IMG-20221214-WA0001.jpg (Datei angehängt)')).toMatchObject({ kind: 'image' });
    expect(att('IMG-20221214-WA0001.jpg (fichier joint)')).toMatchObject({ kind: 'image' });
    expect(att('<attached: 00000001-PHOTO-2022-12-14-21-05-00.jpg>')).toMatchObject({ kind: 'image' });
    expect(att('<adjunto: 00000002-AUDIO-2022-12-14-21-05-00.opus>')).toMatchObject({ kind: 'voice' });
    // respaldo por nombre característico aunque el idioma del sufijo sea desconocido
    expect(att('VID-20221214-WA0003.mp4 (ملف مرفق)')).toMatchObject({ kind: 'video' });
  });
});
