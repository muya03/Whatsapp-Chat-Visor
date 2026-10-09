import { expect, test } from '@playwright/test';
import { cpSync, createReadStream, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { ZIP } from './helpers';

/**
 * Simula un despliegue nuevo sobre una COPIA aislada de dist (no toca el servidor que usan el resto de tests):
 * cambia la versión del SW y el index.html, y comprueba el flujo de actualización controlada.
 */
test.skip(({ browserName }) => browserName !== 'chromium', 'flujo de SW en Chromium');
test.use({ viewport: { width: 1280, height: 800 } });

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

test('actualización: aviso, el chat abierto no se pierde y se limpian cachés antiguas', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'wv-update-'));
  cpSync(join(process.cwd(), 'dist'), dir, { recursive: true });
  const server: Server = createServer((req, res) => {
    let p = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]!)).replace(/^(\.\.[/\\])+/, '');
    if (p.endsWith('/')) p += 'index.html';
    const f = join(dir, p);
    try {
      const st = statSync(f);
      res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-cache', vary: 'Origin' });
      createReadStream(f).pipe(res);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://localhost:${(server.address() as { port: number }).port}`;
  try {
    await page.goto(base + '/');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 10_000 }).toBe(true).catch(async () => {
      await page.reload();
    });
    await page.waitForFunction(async () => (await caches.keys()).length === 1);
    const v1 = (await page.evaluate(() => caches.keys()))[0]!;

    // Abre un chat: la actualización no debe interrumpirlo.
    await page.getByTestId('file-input').setInputFiles(ZIP);
    await page.getByRole('dialog').getByRole('button', { name: 'Hecho' }).click();
    await expect(page.getByText('Último mensaje del ejemplo')).toBeVisible();

    // «Despliegue» de una versión nueva: cambia sw.js (versión) e index.html.
    const swPath = join(dir, 'sw.js');
    const sw = readFileSync(swPath, 'utf8');
    writeFileSync(swPath, sw.replace(/const VERSION = '[0-9a-f]+';/, "const VERSION = 'newbuild00001';"));
    const idxPath = join(dir, 'index.html');
    writeFileSync(idxPath, readFileSync(idxPath, 'utf8').replace('<head>', '<head><meta name="x-build" content="NEW">'));

    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
    const toast = page.getByText('Hay una nueva versión de la aplicación.');
    await expect(toast).toBeVisible({ timeout: 10_000 });
    // Ambas cachés conviven hasta que el usuario decide; la sesión actual sigue sirviéndose de la versión vieja (sin mezclar).
    expect((await page.evaluate(() => caches.keys())).sort()).toEqual([v1, 'wv-shell-newbuild00001'].sort());
    await expect(page.getByText('Último mensaje del ejemplo')).toBeVisible();
    expect(await page.locator('meta[name=x-build]').count()).toBe(0);

    await page.getByRole('button', { name: 'Actualizar' }).click();
    await page.waitForFunction(() => document.querySelector('meta[name=x-build]')?.getAttribute('content') === 'NEW', undefined, { timeout: 15_000 });
    await expect.poll(() => page.evaluate(() => caches.keys()), { timeout: 10_000 }).toEqual(['wv-shell-newbuild00001']);
    await expect(page.getByTestId('file-input')).toBeAttached();
  } finally {
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
