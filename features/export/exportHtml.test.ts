// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { makeSession } from '../../tests/helpers/session';
import { buildExport, esc, nodesToHtml, summarizeExport } from './exportHtml';
import { parseRichText } from '../../parser/whatsapp/richText';

describe('exportación HTML', () => {
  it('esc neutraliza caracteres peligrosos y nodesToHtml no permite HTML arbitrario', () => {
    expect(esc(`<a href="x" onclick='y'>&`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;');
    const html = nodesToHtml(parseRichText('*<script>alert(1)</script>* https://example.com/<b> javascript:alert(1)'));
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>');
    expect(html).not.toMatch(/href="javascript/i);
  });

  it('genera un HTML autónomo con orden, fechas, remitentes y formato; sin scripts ni recursos externos', async () => {
    const session = await makeSession(
      [
        '14/12/22, 21:05 - Ana: Hola *mundo* <img src=x onerror=alert(1)>',
        '14/12/22, 21:06 - Beto: segunda línea',
        'línea siguiente',
        '15/12/22, 9:00 - Beto: IMG-20221214-WA0001.jpg (archivo adjunto)',
        '',
      ].join('\n'),
    );
    session.me = 'Ana';
    const { blob, fileName } = await buildExport(session, { mode: 'html', title: 'Chat <de> "prueba"', theme: 'light', skin: 'web', timeFormat: 'auto' });
    expect(fileName).toBe('Chat _de_ _prueba_.html');
    const html = await blob.text();
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html.indexOf('Hola')).toBeLessThan(html.indexOf('segunda línea'));
    expect(html).toContain('14 de diciembre de 2022');
    expect(html).toContain('15 de diciembre de 2022');
    expect(html).toContain('<strong>mundo</strong>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toMatch(/<img[^>]+onerror/);
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/(src|href)="https?:\/\//);
    expect(html).toContain('row--out'); // Ana
    expect(html).toContain('Chat &lt;de&gt; &quot;prueba&quot;');
    expect(html).toContain('IMG-20221214-WA0001.jpg');
    expect(html).toContain('no incluido');
  });

  it('resume qué adjuntos no se pueden exportar', async () => {
    const session = await makeSession('14/12/22, 21:05 - Ana: IMG-1.jpg (archivo adjunto)\n14/12/22, 21:06 - Ana: <Multimedia omitido>\n');
    expect(summarizeExport(session)).toMatchObject({ attachmentsTotal: 2, available: 0, omitted: 1, missing: 1 });
  });
});
