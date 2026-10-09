import { describe, expect, it } from 'vitest';
import { conversationTitle, titleFromFileName } from '../features/conversation/title';
import { parseChat } from '../parser/whatsapp/parser';
import { formatBytes, formatDayLabel, formatDuration, formatTime, initials, senderColorIndex } from './format';

describe('formatTime', () => {
  const ts = Date.UTC(2022, 11, 14, 21, 5);
  it('24 h / 12 h / auto según el archivo', () => {
    expect(formatTime(ts, '', '24', false)).toBe('21:05');
    expect(formatTime(ts, '', '12', false)).toBe('9:05 p. m.');
    expect(formatTime(ts, '', 'auto', true)).toBe('9:05 p. m.');
    expect(formatTime(ts, '', 'auto', false)).toBe('21:05');
    expect(formatTime(Date.UTC(2022, 0, 1, 0, 7), '', '12', false)).toBe('12:07 a. m.');
  });
  it('sin fecha válida muestra el texto original', () => {
    expect(formatTime(null, '31/02/22, 10:00', 'auto', false)).toBe('31/02/22, 10:00');
  });
});

describe('formatDayLabel', () => {
  const now = new Date(2023, 0, 15, 12);
  it('hoy, ayer, día de la semana y fecha completa', () => {
    expect(formatDayLabel(20230115, now)).toBe('Hoy');
    expect(formatDayLabel(20230114, now)).toBe('Ayer');
    expect(formatDayLabel(20230112, now)).toBe('Jueves');
    expect(formatDayLabel(20221214, now)).toBe('14 de diciembre de 2022');
  });
});

describe('utilidades', () => {
  it('bytes y duración', () => {
    expect(formatBytes(404)).toBe('404 B');
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe('5,0 GB');
    expect(formatDuration(4)).toBe('0:04');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(NaN)).toBe('');
  });
  it('color de remitente estable y dentro de la paleta', () => {
    expect(senderColorIndex('Ana')).toBe(senderColorIndex('Ana'));
    for (const n of ['Ana', 'Beto', '+34 600', '🌸', 'مرحبا']) expect(senderColorIndex(n)).toBeGreaterThanOrEqual(0), expect(senderColorIndex(n)).toBeLessThan(12);
  });
  it('iniciales', () => {
    expect(initials('Ana Pérez')).toBe('AP');
    expect(initials('~ Juan')).toBe('J');
    expect(initials('')).toBe('?');
  });
});

describe('título de la conversación', () => {
  it('a partir del nombre del archivo en varios idiomas', () => {
    expect(titleFromFileName('Chat de WhatsApp con Ana Pérez.zip')).toBe('Ana Pérez');
    expect(titleFromFileName('WhatsApp Chat with Bob.zip')).toBe('Bob');
    expect(titleFromFileName('WhatsApp Chat - Familia.zip')).toBe('Familia');
    expect(titleFromFileName('WhatsApp-Chat mit Carla.txt')).toBe('Carla');
    expect(titleFromFileName('_chat.txt')).toBeNull();
    expect(titleFromFileName('Chat de WhatsApp con Ana (1).zip')).toBe('Ana');
  });
  it('prioridad: personalizado → el otro participante → archivo → grupo → participantes', () => {
    const chat = parseChat('01/01/23, 10:00 - Ana: a\n01/01/23, 10:01 - Beto: b\n');
    expect(conversationTitle(chat, '_chat.txt', 'Ana', null)).toBe('Beto');
    expect(conversationTitle(chat, '_chat.txt', 'Ana', 'Mi chat')).toBe('Mi chat');
    expect(conversationTitle(chat, '_chat.txt', null, null)).toBe('Ana, Beto');
    expect(conversationTitle(chat, 'Chat de WhatsApp con Carla.zip', null, null)).toBe('Carla');
  });
});
