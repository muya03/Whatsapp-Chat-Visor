import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { SAMPLES, ZIP, importAndChoose, noHorizontalScroll } from './helpers';

test.describe('diseño móvil', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) >= 800, 'solo móvil');

  test('la pantalla de importación no tiene scroll horizontal ni desborda', async ({ page }) => {
    await page.goto('/');
    const s = await noHorizontalScroll(page);
    expect(s.page).toBeLessThanOrEqual(0);
    await expect(page.getByTestId('pick-file')).toBeInViewport();
    const w = await page.locator('.landing__col').evaluate((el) => el.getBoundingClientRect().width);
    expect(w).toBeLessThanOrEqual(page.viewportSize()!.width);
  });

  test('la conversación ocupa el 100 % de la pantalla, sin marcos ni scroll horizontal', async ({ page }) => {
    await importAndChoose(page, ZIP, 'Ana Ejemplo');
    const vp = page.viewportSize()!;
    const main = await page.locator('.main').boundingBox();
    expect(Math.round(main!.x)).toBe(0);
    expect(Math.round(main!.y)).toBe(0);
    expect(Math.round(main!.width)).toBe(vp.width);
    expect(Math.round(main!.height)).toBe(vp.height);
    // el panel lateral no está visible mientras se lee
    await expect(page.locator('.side')).toBeHidden();
    const s = await noHorizontalScroll(page);
    expect(s.page).toBeLessThanOrEqual(0);
    expect(s.list).toBeLessThanOrEqual(0);
    // sin tarjeta contenedora ni sombra de dispositivo
    const style = await page.locator('.app').evaluate((el) => getComputedStyle(el).boxShadow + getComputedStyle(el).borderRadius);
    expect(style).toBe('none0px');
    // cabecera compacta y controles táctiles de al menos 40 px
    const hdr = await page.locator('.hdr--chat').boundingBox();
    expect(hdr!.height).toBeLessThanOrEqual(80);
    for (const name of ['Atrás', 'Buscar', 'Ir a una fecha', 'Más opciones']) {
      const b = await page.getByRole('button', { name, exact: true }).first().boundingBox();
      expect(b!.width, name).toBeGreaterThanOrEqual(40);
      expect(b!.height, name).toBeGreaterThanOrEqual(40);
    }
    // el pie de solo lectura es visible y no tapa mensajes (la lista termina donde empieza el pie)
    const footer = await page.locator('.footer').boundingBox();
    const list = await page.locator('.msglist').boundingBox();
    expect(Math.round(list!.y + list!.height)).toBeLessThanOrEqual(Math.round(footer!.y) + 1);
  });

  test('las barras de desplazamiento no son visibles en táctiles', async ({ page }) => {
    await importAndChoose(page, join(SAMPLES, 'chat-solo-texto.txt'), 'Ana Ejemplo');
    const sw = await page.locator('.msglist').evaluate((el) => (el as HTMLElement).offsetWidth - el.clientWidth);
    expect(sw).toBe(0);
  });

  test('«Atrás» cierra primero ajustes/visor y luego vuelve a la lista, como en WhatsApp', async ({ page }) => {
    await importAndChoose(page, ZIP, 'Ana Ejemplo');
    await page.getByRole('button', { name: 'Más opciones' }).last().click();
    await page.getByRole('menuitem', { name: 'Ajustes' }).click();
    await expect(page.getByRole('dialog', { name: 'Ajustes' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog', { name: 'Ajustes' })).toBeHidden();
    await expect(page.locator('.main')).toBeVisible();
    await page.goBack();
    await expect(page.locator('.side')).toBeVisible();
    await expect(page.locator('.main')).toBeHidden();
  });

  test('la búsqueda ocupa la cabecera y permite navegar', async ({ page }) => {
    await importAndChoose(page, ZIP, 'Ana Ejemplo');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(page.getByRole('searchbox')).toBeFocused();
    const box = await page.locator('.hdr--chat .searchbox').boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
  });

  test('horizontal: sigue en diseño móvil y sin desbordes', async ({ page }) => {
    const vp = page.viewportSize()!;
    await importAndChoose(page, ZIP, 'Ana Ejemplo');
    await page.setViewportSize({ width: vp.height, height: Math.min(vp.width, 430) });
    await expect(page.locator('.app')).toHaveClass(/app--mobile/);
    const s = await noHorizontalScroll(page);
    expect(s.page).toBeLessThanOrEqual(0);
    expect(s.list).toBeLessThanOrEqual(0);
  });

  test('la altura sigue al viewport visible (--vv-height) para el teclado de iOS', async ({ page }) => {
    await page.goto('/');
    const h = await page.evaluate(() => getComputedStyle(document.querySelector('.landing')!).height);
    expect(Math.abs(parseFloat(h) - page.viewportSize()!.height)).toBeLessThan(2);
  });
});

test.describe('diseño escritorio', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 800, 'solo escritorio');

  test('dos paneles a pantalla completa y scroll solo en la lista de mensajes', async ({ page }) => {
    await importAndChoose(page, ZIP, 'Ana Ejemplo');
    const vp = page.viewportSize()!;
    const side = await page.locator('.side').boundingBox();
    const main = await page.locator('.main').boundingBox();
    expect(side!.width).toBeGreaterThanOrEqual(340);
    expect(main!.x).toBeCloseTo(side!.x + side!.width, 0);
    expect(Math.round(main!.x + main!.width)).toBe(vp.width);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    const over = await page.evaluate(() => getComputedStyle(document.body).overflow);
    expect(over).toBe('hidden');
    // solo se muestra la conversación importada; no se inventan otras
    await expect(page.locator('.chat-item')).toHaveCount(1);
  });
});
