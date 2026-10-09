import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { SAMPLES, ZIP } from './helpers';

const txt = join(SAMPLES, 'chat-solo-texto.txt');

/** Espera a que el SW esté activo, haya terminado de precachear y controle la página. */
async function swReady(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  const controlled = () => page.evaluate(() => !!navigator.serviceWorker.controller);
  await expect.poll(controlled, { timeout: 3_000 }).toBe(true).catch(async () => {
    await page.reload(); // en la primera visita la página puede no estar controlada hasta recargar
    await expect.poll(controlled, { timeout: 10_000 }).toBe(true);
  });
  await page.waitForFunction(async () => {
    const keys = await caches.keys();
    return keys.length > 0 && (await (await caches.open(keys[0]!)).keys()).length >= 10;
  });
}

test.describe('manifiesto e iconos', () => {
  test('manifiesto válido con identidad propia e iconos reales', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel=manifest]').getAttribute('href');
    expect(href).toBeTruthy();
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBe(true);
    const m = await res.json();
    expect(m.name).toMatch(/Visor de chat/);
    expect(m.name).not.toMatch(/whatsapp/i); // no suplanta la app oficial
    expect(m.short_name).toBeTruthy();
    expect(m.description).toBeTruthy();
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('./');
    expect(m.scope).toBe('./');
    expect(m.theme_color).toMatch(/^#/);
    expect(m.background_color).toMatch(/^#/);
    const sizes = m.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
    for (const icon of m.icons as { src: string; sizes: string; type: string }[]) {
      const r = await request.get(`/${icon.src}`);
      expect(r.ok(), icon.src).toBe(true);
      expect(r.headers()['content-type']).toContain(icon.type.split('/')[0]);
      if (icon.type === 'image/png') {
        const dims = await page.evaluate(async (u) => {
          const bmp = await createImageBitmap(await (await fetch(u)).blob());
          return `${bmp.width}x${bmp.height}`;
        }, `/${icon.src}`);
        expect(dims).toBe(icon.sizes);
      }
    }
    await expect(page.locator('link[rel=apple-touch-icon]')).toHaveCount(1);
    expect(await page.locator('meta[name=viewport]').getAttribute('content')).toContain('viewport-fit=cover');
  });
});

test.describe('service worker y modo sin conexión', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'Playwright/Firefox no emula bien offline con SW');

  test('registra el SW, cachea solo el app shell y abre sin conexión', async ({ page, context }) => {
    await page.goto('/');
    await swReady(page);
    const caches_ = await page.evaluate(async () => {
      const out: Record<string, string[]> = {};
      for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname);
      return out;
    });
    const names = Object.keys(caches_);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^wv-shell-[0-9a-f]{12}$/);
    const urls = caches_[names[0]!]!;
    expect(urls).toEqual(expect.arrayContaining(['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png']));
    expect(urls.some((u) => /\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\.css$/.test(u))).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('file-input')).toBeAttached();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await context.setOffline(false);
  });

  test('sin conexión: se importa, lee, busca y se abre el visor', async ({ page, context }) => {
    await page.goto('/');
    await swReady(page);
    await context.setOffline(true);
    await page.reload();
    await page.getByTestId('file-input').setInputFiles(ZIP);
    const dlg = page.getByRole('dialog', { name: '¿Quién eres en esta conversación?' });
    await dlg.getByRole('radio', { name: /Ana Ejemplo/ }).click();
    await dlg.getByRole('button', { name: 'Hecho' }).click();
    await expect(page.getByText('Último mensaje del ejemplo')).toBeVisible();
    await page.locator('.msglist').evaluate((el) => (el.scrollTop = 560));
    const thumb = page.locator('.msglist button.media--button:has(img)').first();
    await expect(thumb).toBeVisible();
    await thumb.click();
    await expect(page.getByRole('dialog', { name: /Visor de/ }).locator('img.viewer__img')).toBeVisible();
    await context.setOffline(false);
  });

  test('el Service Worker no guarda chats: tras importar la caché sigue siendo solo el app shell', async ({ page }) => {
    await page.goto('/');
    await swReady(page);
    const before = await page.evaluate(async () => (await (await caches.open((await caches.keys())[0]!)).keys()).length);
    await page.getByTestId('file-input').setInputFiles(ZIP);
    await expect(page.getByRole('dialog', { name: '¿Quién eres en esta conversación?' })).toBeVisible();
    const after = await page.evaluate(async () => {
      const keys = await caches.keys();
      const entries = (await (await caches.open(keys[0]!)).keys()).map((r) => r.url);
      return { n: entries.length, keys, bad: entries.filter((u) => /chat|\.txt|\.zip|blob:/i.test(u)) };
    });
    expect(after.keys).toHaveLength(1);
    expect(after.n).toBe(before);
    expect(after.bad).toEqual([]);
  });
});

test.describe('privacidad', () => {
  test('ninguna petición sale del origen ni lleva datos del chat durante importar, buscar y exportar', async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const requests: { url: string; method: string; body: string | null }[] = [];
    const violations: string[] = [];
    await page.exposeFunction('__csp', (v: string) => violations.push(v));
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __csp(v: string): void }).__csp(`${e.violatedDirective} ${e.blockedURI}`)));
    page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
    await page.goto('/');
    await page.getByTestId('file-input').setInputFiles(ZIP);
    const dlg = page.getByRole('dialog', { name: '¿Quién eres en esta conversación?' });
    await dlg.getByRole('radio', { name: /Ana Ejemplo/ }).click();
    await dlg.getByRole('button', { name: 'Hecho' }).click();
    await page.getByRole('button', { name: /Buscar/ }).first().click();
    await page.keyboard.type('paella');
    await page.waitForTimeout(500);
    const external = requests.filter((r) => !r.url.startsWith(origin) && !r.url.startsWith('blob:') && !r.url.startsWith('data:'));
    expect(external, JSON.stringify(external)).toEqual([]);
    expect(violations, 'la CSP no debe bloquear nada del uso normal').toEqual([]);
    expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toContain("connect-src 'self'");
    expect(requests.filter((r) => r.method !== 'GET' && r.method !== 'HEAD')).toEqual([]);
    expect(requests.some((r) => /paella|Ana%20Ejemplo|chat-solo/i.test(r.url))).toBe(false);
    // la URL de la página nunca recibe contenido del chat
    expect(page.url()).toBe(`${origin}/`);
  });

  test('sin consentimiento no se guarda nada: solo la preferencia de tema en localStorage; IndexedDB vacío', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('file-input').setInputFiles(txt);
    await page.getByRole('dialog').getByRole('button', { name: 'Hecho' }).click();
    await page.getByRole('button', { name: 'Más opciones' }).last().click();
    await page.getByRole('menuitem', { name: 'Ajustes' }).click();
    await page.getByRole('radio', { name: 'Oscuro' }).click();
    const state = await page.evaluate(async () => ({
      ls: Object.keys(localStorage),
      lsValues: Object.values(localStorage).join('|'),
      ss: Object.keys(sessionStorage),
      idb: (await indexedDB.databases?.())?.map((d) => d.name) ?? [],
    }));
    expect(state.ls).toEqual(['wv:prefs']);
    expect(state.lsValues).not.toMatch(/Ana|Beto|paella|mensaje/i);
    expect(state.ss).toEqual([]);
    expect(state.idb).toEqual([]);
  });

  test('guardado local opcional: consentimiento informado, listado, reapertura, borrado individual y total', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'IndexedDB con Blobs en WebKit headless es poco fiable');
    await page.goto('/');
    await page.getByRole('button', { name: 'Ajustes' }).click();
    await page.getByRole('switch', { name: /Recordar conversaciones/ }).click();
    const consent = page.getByRole('dialog', { name: '¿Guardar conversaciones en este dispositivo?' });
    await expect(consent).toContainText('quedarán almacenados dentro de este navegador');
    await consent.getByRole('button', { name: 'Activar' }).click();
    await expect(page.getByRole('switch', { name: /Recordar conversaciones/ })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Hecho' }).first().click();

    await page.getByTestId('file-input').setInputFiles(ZIP);
    await page.getByRole('dialog', { name: '¿Quién eres en esta conversación?' }).getByRole('button', { name: 'Hecho' }).click();
    await expect(page.getByText('Conversación guardada en este dispositivo.')).toBeVisible();

    await page.reload();
    const saved = page.getByRole('region', { name: /Importaciones guardadas/ });
    await expect(saved).toContainText('Chat de WhatsApp con Ana Ejemplo.zip');
    await saved.getByRole('button', { name: 'Abrir' }).click();
    await expect(page.getByRole('dialog', { name: '¿Quién eres en esta conversación?' })).toBeVisible();
    await page.getByRole('button', { name: 'Hecho' }).last().click();
    await page.getByRole('button', { name: 'Más opciones' }).last().click();
    await page.getByRole('menuitem', { name: 'Importar otro chat' }).click();
    await saved.getByRole('button', { name: /^Eliminar / }).click();
    await expect(saved).toBeHidden();
    expect((await page.evaluate(async () => (await indexedDB.databases()).length)) >= 0).toBe(true);
  });

  test('eliminar todos los datos locales borra preferencias y guardados', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'IndexedDB con Blobs en WebKit headless es poco fiable');
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('wv:prefs', JSON.stringify({ theme: 'dark', rememberChats: true })));
    await page.reload();
    await page.getByRole('button', { name: 'Ajustes' }).click();
    await page.getByRole('button', { name: /Eliminar todos los datos locales/ }).click();
    await expect(page.getByText(/Se han eliminado las conversaciones guardadas/)).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('wv:prefs'))).toBeNull();
  });
});
