import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MediaCtx, type MediaCtxValue } from '../media/MediaContext';
import { MediaStore } from '../../services/mediaStore';
import { EMPTY_MEDIA_INDEX } from '../../services/zipReader';
import { parseChat } from '../../parser/whatsapp/parser';
import { ChatRow } from './ChatRow';

const ctx: MediaCtxValue = { media: EMPTY_MEDIA_INDEX, store: new MediaStore(), hasZip: false, openViewer: () => undefined };

function renderRow(text: string, opts: { me?: string | null; first?: boolean; isGroup?: boolean } = {}) {
  const chat = parseChat(text);
  const msg = chat.messages[0]!;
  const me = opts.me === undefined ? null : opts.me;
  return render(
    <MediaCtx.Provider value={ctx}>
      <ChatRow
        row={{ t: 'msg', msg: 0, first: opts.first ?? true, last: true }}
        msg={msg}
        me={me}
        isGroup={opts.isGroup ?? false}
        showNamesInPrivate={false}
        timeFormat="auto"
        sourceHour12={false}
        hlQuery=""
        hlCurrent={false}
        flash={false}
      />
    </MediaCtx.Provider>,
  );
}

describe('seguridad del contenido importado', () => {
  it('HTML, scripts y manejadores de eventos se muestran como texto, nunca se ejecutan ni se insertan', () => {
    const evil = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script> <b>hola</b>';
    const { container } = renderRow(`14/12/22, 21:05 - Ana: ${evil}\n`);
    expect(container.querySelector('img, script, b')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=');
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('enlaces: solo http(s), con noopener y sin abrirse solos', () => {
    const { container } = renderRow('14/12/22, 21:05 - Ana: ver https://example.com/a y javascript:alert(1) y data:text/html,x y www.ejemplo.es\n');
    const links = [...container.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://example.com/a', 'https://www.ejemplo.es/']);
    for (const a of links) {
      expect(a.getAttribute('rel')).toContain('noopener');
      expect(a.getAttribute('target')).toBe('_blank');
    }
    expect(container.textContent).toContain('javascript:alert(1)');
  });

  it('el nombre del remitente con HTML se escapa', () => {
    const { container } = renderRow('14/12/22, 21:05 - <b>Ana</b>: hola\n', { me: 'otro' });
    expect(container.querySelector('b')).toBeNull();
  });
});

describe('orientación y presentación', () => {
  const text = '14/12/22, 21:05 - Ana: hola\n';
  it('«yo» a la derecha; los demás a la izquierda', () => {
    expect(renderRow(text, { me: 'Ana' }).container.querySelector('.row--out')).not.toBeNull();
    expect(renderRow(text, { me: 'Beto' }).container.querySelector('.row--in')).not.toBeNull();
  });
  it('vista neutral: todo a la izquierda y con nombre', () => {
    const { container } = renderRow(text, { me: null });
    expect(container.querySelector('.row--out')).toBeNull();
    expect(container.querySelector('.bubble__sender')?.textContent).toBe('Ana');
  });
  it('en chats individuales con «yo» no se muestran nombres; en grupos sí (primer mensaje del grupo)', () => {
    expect(renderRow(text, { me: 'Beto', isGroup: false }).container.querySelector('.bubble__sender')).toBeNull();
    expect(renderRow(text, { me: 'Beto', isGroup: true }).container.querySelector('.bubble__sender')?.textContent).toBe('Ana');
    expect(renderRow(text, { me: 'Beto', isGroup: true, first: false }).container.querySelector('.bubble__sender')).toBeNull();
  });
  it('solo el primer mensaje del grupo lleva cola', () => {
    expect(renderRow(text, { me: 'Ana', first: true }).container.querySelector('.bubble--tail')).not.toBeNull();
    expect(renderRow(text, { me: 'Ana', first: false }).container.querySelector('.bubble--tail')).toBeNull();
  });
  it('no inventa marcas de lectura/entrega', () => {
    const { container } = renderRow(text, { me: 'Ana' });
    expect(container.querySelector('[data-icon], .ticks, .status')).toBeNull();
    expect(container.querySelector('.bubble__meta')?.textContent).toBe('21:05');
  });
  it('adjunto faltante muestra una tarjeta, nunca una imagen rota', () => {
    const { container } = renderRow('14/12/22, 21:05 - Ana: IMG-20221214-WA0001.jpg (archivo adjunto)\n');
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('IMG-20221214-WA0001.jpg')).toBeInTheDocument();
    expect(screen.getByText(/no disponible/)).toBeInTheDocument();
  });
  it('mensaje de solo emojis se amplía', () => {
    expect(renderRow('14/12/22, 21:05 - Ana: 🔥\n').container.querySelector('.bubble__text--jumbo')).not.toBeNull();
    expect(renderRow('14/12/22, 21:05 - Ana: 🔥 hola\n').container.querySelector('.bubble__text--jumbo')).toBeNull();
  });
  it('aviso de cifrado como mensaje del sistema', () => {
    const chat = parseChat('14/12/22, 21:05 - Los mensajes y las llamadas están cifrados de extremo a extremo.\n');
    const { container } = render(
      <MediaCtx.Provider value={ctx}>
        <ChatRow row={{ t: 'sys', msg: 0 }} msg={chat.messages[0]} me={null} isGroup={false} showNamesInPrivate={false} timeFormat="auto" sourceHour12={false} hlQuery="" hlCurrent={false} flash={false} />
      </MediaCtx.Provider>,
    );
    expect(container.querySelector('.chip--notice')).not.toBeNull();
  });
});
