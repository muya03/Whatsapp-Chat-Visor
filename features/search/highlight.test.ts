import { describe, expect, it } from 'vitest';
import { foldKeepLength, snippetAround, splitByQuery } from './highlight';

describe('highlight', () => {
  it('conserva longitud al plegar', () => {
    for (const s of ['Canción', 'ÑANDÚ', 'İstanbul', 'ß', '👨‍👩‍👧 hola', 'مرحبا']) expect(foldKeepLength(s)).toHaveLength(s.length);
  });
  it('resalta sin distinguir mayúsculas ni tildes, sobre el texto original', () => {
    const segs = splitByQuery('La Canción de CANCIÓN', foldKeepLength('cancion'));
    expect(segs.filter((x) => x.hit).map((x) => x.text)).toEqual(['Canción', 'CANCIÓN']);
    expect(segs.map((x) => x.text).join('')).toBe('La Canción de CANCIÓN');
  });
  it('sin coincidencias devuelve el texto íntegro', () => {
    expect(splitByQuery('hola', 'zzz')).toEqual([{ text: 'hola', hit: false }]);
  });
  it('fragmento corto centrado', () => {
    const t = 'a'.repeat(100) + ' objetivo ' + 'b'.repeat(100);
    const s = snippetAround(t, 'objetivo');
    expect(s).toContain('objetivo');
    expect(s.length).toBeLessThan(120);
  });
});
