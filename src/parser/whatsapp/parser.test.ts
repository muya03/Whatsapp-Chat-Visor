import { describe, expect, it } from 'vitest';
import { fixture } from '../../tests/helpers/fixtures';
import { parseChat } from './parser';

const fmt = (ts: number | null) => (ts === null ? null : new Date(ts).toISOString().slice(0, 19));

describe('parseChat · Android ES grupo', () => {
  const chat = parseChat(fixture('android-es-group.txt'));
  const m = chat.messages;

  it('detecta plataforma, orden de fecha y 24 h', () => {
    expect(chat.platform).toBe('android');
    expect(chat.dateOrder).toBe('DMY');
    expect(chat.dateOrderAmbiguous).toBe(false); // 31/12 solo puede ser día
    expect(chat.sourceHour12).toBe(false);
  });

  it('conserva el orden original y la numeración estable', () => {
    expect(m.map((x) => x.id)).toEqual(m.map((_, i) => i));
    expect(m.map((x) => x.line)).toEqual([...m.map((x) => x.line)].sort((a, b) => a - b));
  });

  it('normaliza fecha y hora sin zona horaria (hora de pared)', () => {
    const hola = m.find((x) => x.text.startsWith('Hola a todos'))!;
    expect(fmt(hola.ts)).toBe('2022-12-14T09:02:00');
    expect(hola.dayKey).toBe(20221214);
    expect(fmt(m.find((x) => x.text === 'Ya es otro día')!.ts)).toBe('2022-12-15T00:05:00');
  });

  it('une los mensajes multilínea en un único mensaje', () => {
    const beto = m.find((x) => x.sender === 'Beto' && x.text.startsWith('Buenas'))!;
    expect(beto.text).toBe('Buenas!\nSegunda línea del mensaje de Beto');
  });

  it('identifica participantes, incluidos teléfonos con espacios', () => {
    expect(chat.participants.map((p) => p.name)).toEqual(['Ana', 'Beto', '+34 612 34 56 78']);
    expect(chat.isGroup).toBe(true);
    expect(chat.groupNameHint).toBe('Equipo Fantasma');
  });

  it('clasifica avisos del sistema sin convertir mensajes normales en avisos', () => {
    const sys = m.filter((x) => x.kind === 'system');
    expect(sys.map((x) => x.system)).toEqual([
      'encryption',
      'group-created',
      'participant-added',
      'participant-left',
      'subject-changed',
    ]);
    expect(m.find((x) => x.text.startsWith('Hola a todos'))!.kind).toBe('text');
  });

  it('un aviso con dos puntos entre comillas no se toma por mensaje de un remitente', () => {
    const subject = m.find((x) => x.system === 'subject-changed')!;
    expect(subject.sender).toBeNull();
    expect(subject.text).toContain('Equipo Fantasma: v1');
  });

  it('extrae adjuntos y deja el pie de foto', () => {
    const photo = m.find((x) => x.attachments[0]?.fileName === 'IMG-20221214-WA0001.jpg')!;
    expect(photo.kind).toBe('media');
    expect(photo.attachments[0]).toMatchObject({ kind: 'image', omitted: false, key: 'img-20221214-wa0001.jpg' });
    expect(photo.text).toBe('Mira qué foto');
  });

  it('reconoce contenido omitido y mensajes eliminados', () => {
    const omitted = m.find((x) => x.attachments[0]?.omitted)!;
    expect(omitted.kind).toBe('media');
    expect(omitted.text).toBe('');
    expect(m.find((x) => x.kind === 'deleted')?.sender).toBe('Beto');
  });

  it('no inventa estados ni datos que no están en el archivo', () => {
    for (const x of m) expect(Object.keys(x)).not.toContain('status');
    expect(chat.issues.filter((i) => i.code === 'invalid-date')).toEqual([]);
  });
});

describe('parseChat · iOS EN 12 h', () => {
  const chat = parseChat(fixture('ios-en-pair.txt'));
  const m = chat.messages;

  it('detecta iOS, MDY (por 12/14) y AM/PM', () => {
    expect(chat.platform).toBe('ios');
    expect(chat.dateOrder).toBe('MDY');
    expect(chat.sourceHour12).toBe(true);
    expect(chat.isGroup).toBe(false);
  });

  it('convierte 12 h correctamente, incluidos 12 AM / 12 PM', () => {
    expect(fmt(m.find((x) => x.text === 'Hi Bob!')!.ts)).toBe('2022-12-14T09:00:30');
    expect(fmt(m.find((x) => x.text === 'Good night')!.ts)).toBe('2022-12-14T23:59:59');
    expect(fmt(m.find((x) => x.text === "it's after midnight")!.ts)).toBe('2022-12-15T00:00:00');
    expect(fmt(m.find((x) => x.kind === 'call')!.ts)).toBe('2022-12-14T12:30:00');
  });

  it('quita las marcas invisibles de los remitentes y reconoce <attached:>', () => {
    expect(chat.participants.map((p) => p.name)).toEqual(['Alice', 'Bob']);
    const photo = m.find((x) => x.attachments[0]?.fileName?.includes('PHOTO'))!;
    expect(photo.attachments[0]).toMatchObject({ kind: 'image', omitted: false });
    expect(photo.text).toBe('');
  });

  it('reconoce llamadas y "image omitted"', () => {
    expect(m.filter((x) => x.kind === 'call')).toHaveLength(2);
    const omitted = m.find((x) => x.attachments[0]?.omitted)!;
    expect(omitted.attachments[0]!.kind).toBe('image');
  });

  it('el aviso de cifrado enviado como mensaje sigue su remitente (dato del archivo)', () => {
    expect(m[0]!.sender).toBe('Alice');
  });
});

describe('formatos de fecha', () => {
  it('fechas ambiguas: elige DMY por el campo que cambia despacio y lo marca como ambiguo', () => {
    const chat = parseChat(fixture('ambiguous-dates.txt'));
    expect(chat.dateOrder).toBe('DMY');
    expect(chat.dateOrderAmbiguous).toBe(true);
    expect(chat.issues.some((i) => i.code === 'ambiguous-date-order')).toBe(true);
    expect(chat.messages[0]!.dayKey).toBe(20230201);
  });

  it('el usuario puede corregir el orden sin volver a leer el archivo', () => {
    const chat = parseChat(fixture('ambiguous-dates.txt'), { dateOrder: 'MDY' });
    expect(chat.dateOrder).toBe('MDY');
    expect(chat.dateOrderAmbiguous).toBe(false);
    expect(chat.messages[0]!.dayKey).toBe(20230102);
  });

  it('12/31 decide MDY', () => {
    const chat = parseChat(fixture('us-mdy.txt'));
    expect(chat.dateOrder).toBe('MDY');
    expect(chat.messages.map((x) => x.dayKey)).toEqual([20230102, 20231231]);
    expect(fmt(chat.messages[1]!.ts)).toBe('2023-12-31T22:00:00');
  });

  it('año primero (ISO)', () => {
    const chat = parseChat(fixture('iso-dates.txt'));
    expect(chat.dateOrder).toBe('YMD');
    expect(chat.messages.map((x) => x.dayKey)).toEqual([20221214, 20221214, 20230102]);
  });

  it('dígitos árabes, RTL y marcadores ص/م', () => {
    const chat = parseChat(fixture('rtl-arabic.txt'));
    expect(chat.messages).toHaveLength(2);
    expect(chat.messages[0]!.sender).toBe('ليلى');
    expect(fmt(chat.messages[0]!.ts)).toBe('2022-12-14T09:00:00');
    expect(fmt(chat.messages[1]!.ts)).toBe('2022-12-14T21:05:00');
  });

  it('coreano (mejor esfuerzo): prefijo de periodo y fecha con espacios', () => {
    const chat = parseChat(fixture('korean.txt'));
    expect(chat.messages).toHaveLength(2);
    expect(chat.messages[0]!.sender).toBe('민수');
    expect(fmt(chat.messages[0]!.ts)).toBe('2022-12-14T12:55:00');
  });
});

describe('robustez', () => {
  it('archivo vacío → conversación vacía sin lanzar', () => {
    const chat = parseChat(fixture('empty.txt'));
    expect(chat.messages).toEqual([]);
    expect(chat.participants).toEqual([]);
  });

  it('archivo sin cabeceras → un aviso "unparsed" conservando el contenido', () => {
    const chat = parseChat(fixture('garbage.txt'));
    expect(chat.messages).toHaveLength(1);
    expect(chat.messages[0]).toMatchObject({ kind: 'system', system: 'unparsed' });
    expect(chat.messages[0]!.text).toContain('línea dos');
    expect(chat.issues.map((i) => i.code)).toContain('leading-lines');
  });

  it('líneas que parecen cabeceras no parten el mensaje ni se pierden', () => {
    const chat = parseChat(fixture('tricky-continuations.txt'));
    expect(chat.messages).toHaveLength(3); // texto suelto + Ana + Beto
    const ana = chat.messages.find((x) => x.sender === 'Ana')!;
    expect(ana.text).toBe('lista:\n14/12/22 es la fecha límite\n[14/12/22] tampoco es cabecera');
    expect(chat.messages[0]!.text).toBe('texto suelto antes del primer mensaje');
    expect(chat.issues.find((i) => i.code === 'timestamp-like-line')).toBeTruthy();
  });

  it('fechas imposibles no bloquean la conversación', () => {
    const chat = parseChat('31/02/22, 10:00 - Ana: hola\n01/03/22, 10:00 - Ana: adiós\n');
    expect(chat.messages).toHaveLength(2);
    expect(chat.messages[0]!.text).toBe('hola');
  });

  it('textos muy largos y Unicode (emojis ZWJ, CJK)', () => {
    const long = 'x'.repeat(200_000);
    const chat = parseChat(`01/01/23, 10:00 - Ana: ${long}\n01/01/23, 10:01 - Ana: 👨‍👩‍👧‍👦 你好 café\n`);
    expect(chat.messages[0]!.text).toHaveLength(200_000);
    expect(chat.messages[1]!.text).toBe('👨‍👩‍👧‍👦 你好 café');
  });

  it('CRLF y mensajes vacíos con remitente', () => {
    const chat = parseChat('01/01/23, 10:00 - Ana:\r\n01/01/23, 10:01 - Beto: hola\r\n');
    expect(chat.messages).toHaveLength(2);
    expect(chat.messages[0]).toMatchObject({ sender: 'Ana', text: '' });
  });

  it('cancelación', () => {
    expect(() => parseChat('01/01/23, 10:00 - Ana: hola\n', { isCancelled: () => true })).toThrow('cancelled');
  });

  it('el orden cronológico original se conserva aunque haya saltos hacia atrás', () => {
    const chat = parseChat('02/01/23, 10:00 - Ana: b\n01/01/23, 10:00 - Ana: a\n');
    expect(chat.messages.map((x) => x.text)).toEqual(['b', 'a']);
  });
});

describe('adjuntos Android', () => {
  const chat = parseChat(fixture('media-android.txt'));
  const kinds = chat.messages.map((m) => m.attachments[0]?.kind ?? m.kind);

  it('clasifica por extensión y prefijo', () => {
    expect(kinds).toEqual(['image', 'voice', 'sticker', 'video', 'document', 'contact', 'archive', 'location', 'image']);
  });
  it('conserva nombres Unicode con espacios', () => {
    expect(chat.messages[4]!.attachments[0]!.fileName).toBe('Informe trimestral Ñandú.pdf');
  });
  it('ubicación como enlace, sin abrirlo', () => {
    expect(chat.messages[7]).toMatchObject({ kind: 'location', locationUrl: 'https://maps.google.com/?q=39.986,-0.037' });
  });
});
