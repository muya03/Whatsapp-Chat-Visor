import { describe, expect, it } from 'vitest';
import { emojiOnlyCount, parseRichText, safeHref } from './richText';

describe('parseRichText', () => {
  it('formatos básicos', () => {
    expect(parseRichText('a *b* _c_ ~d~ `e`')).toEqual([
      { t: 'text', v: 'a ' },
      { t: 'bold', c: [{ t: 'text', v: 'b' }] },
      { t: 'text', v: ' ' },
      { t: 'italic', c: [{ t: 'text', v: 'c' }] },
      { t: 'text', v: ' ' },
      { t: 'strike', c: [{ t: 'text', v: 'd' }] },
      { t: 'text', v: ' ' },
      { t: 'mono', v: 'e' },
    ]);
  });
  it('no formatea dentro de palabras ni con espacios pegados', () => {
    expect(parseRichText('snake_case_name 2 * 3 * 4')).toEqual([{ t: 'text', v: 'snake_case_name 2 * 3 * 4' }]);
  });
  it('anidado', () => {
    const n = parseRichText('*hola _mundo_*');
    expect(n[0]).toMatchObject({ t: 'bold' });
  });
  it('el HTML se queda como texto literal', () => {
    expect(parseRichText('<img src=x onerror=alert(1)>')).toEqual([{ t: 'text', v: '<img src=x onerror=alert(1)>' }]);
  });
  it('enlaces: quita puntuación final y solo admite http(s)', () => {
    const n = parseRichText('ver https://example.com/a?b=1. ok www.test.es/x, y javascript:alert(1)');
    const links = n.filter((x) => x.t === 'link');
    expect(links).toEqual([
      { t: 'link', href: 'https://example.com/a?b=1', v: 'https://example.com/a?b=1' },
      { t: 'link', href: 'https://www.test.es/x', v: 'www.test.es/x' },
    ]);
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,<script>')).toBeNull();
  });
  it('bloque de código y citas', () => {
    expect(parseRichText('```a\nb```')).toEqual([{ t: 'code', v: 'a\nb' }]);
    expect(parseRichText('> cita\nresto')[0]).toMatchObject({ t: 'quote' });
  });
  it('multilínea conserva saltos', () => {
    expect(parseRichText('uno\ndos')).toEqual([
      { t: 'text', v: 'uno' },
      { t: 'text', v: '\n' },
      { t: 'text', v: 'dos' },
    ]);
  });
});

describe('emojiOnlyCount', () => {
  it('cuenta emojis aislados (incluyendo ZWJ)', () => {
    expect(emojiOnlyCount('😀')).toBe(1);
    expect(emojiOnlyCount('👨‍👩‍👧‍👦 😀')).toBe(2);
    expect(emojiOnlyCount('hola 😀')).toBe(0);
    expect(emojiOnlyCount('')).toBe(0);
  });
});
