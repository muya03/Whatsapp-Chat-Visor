import { expect, test } from '@playwright/test';
import { ZIP, importAndChoose, msglist } from './helpers';

const isMobile = (p: import('@playwright/test').Page) => (p.viewportSize()?.width ?? 0) < 800;

test.describe('búsqueda, fechas, visor y tema', () => {
  test.beforeEach(async ({ page }) => {
    await importAndChoose(page, ZIP, 'Ana Ejemplo');
  });

  test('búsqueda: contador, resaltado, anterior/siguiente y «sin resultados»', async ({ page }) => {
    if (isMobile(page)) await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    else await page.keyboard.press('ControlOrMeta+f');
    const input = page.getByRole('searchbox', { name: 'Buscar en la conversación' });
    await input.fill('paella');
    await expect(page.locator('.searchbox__counter')).toHaveText('24 de 24');
    await expect(page.locator('.bubble__text mark').first()).toBeVisible();
    await input.press('Enter'); // siguiente (con vuelta al principio)
    await expect(page.locator('.searchbox__counter')).toHaveText('1 de 24');
    await page.getByRole('button', { name: 'Resultado anterior' }).click();
    await expect(page.locator('.searchbox__counter')).toHaveText('24 de 24');
    await input.fill('zzzz-no-existe');
    await expect(page.getByText('No se encontraron mensajes').first()).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar búsqueda' }).last().click();
    await expect(input).toBeHidden();
  });

  test('búsqueda insensible a tildes y mayúsculas, también en nombres de archivo', async ({ page }) => {
    if (isMobile(page)) await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    else await page.keyboard.press('ControlOrMeta+f');
    const input = page.getByRole('searchbox', { name: 'Buscar en la conversación' });
    await input.fill('NANDU');
    await expect(page.locator('.searchbox__counter')).toHaveText('1 de 1');
  });

  test('atajo «/» abre la búsqueda fuera de campos de texto', async ({ page }) => {
    test.skip(isMobile(page), 'sin teclado físico');
    await page.locator('body').click({ position: { x: 700, y: 400 } });
    await page.keyboard.press('/');
    await expect(page.getByRole('searchbox', { name: 'Buscar en la conversación' })).toBeFocused();
  });

  test('ir a una fecha: salta al día, avisa si no hay mensajes y permite volver al final', async ({ page }) => {
    await page.getByRole('button', { name: 'Ir a una fecha' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ir a una fecha' });
    await expect(dialog).toBeVisible();
    // el calendario abre en el último mes con mensajes (enero de 2023)
    await dialog.getByRole('button', { name: /^4 de .*sin mensajes/ }).click();
    await expect(dialog.getByRole('status')).toContainText('No hay mensajes el 4 de enero de 2023');
    await dialog.getByRole('button', { name: /^10 de .*hay mensajes/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.chip--date', { hasText: '10 de enero de 2023' }).first()).toBeVisible();
    // volver al final
    await page.getByRole('button', { name: 'Ir al último mensaje' }).click();
    await expect(page.getByText('Último mensaje del ejemplo')).toBeVisible();
  });

  test('visor multimedia: abrir, navegar, cerrar y conservar la posición del scroll', async ({ page }) => {
    const list = msglist(page);
    await list.evaluate((el) => (el.scrollTop = 560));
    const thumb = page.locator('.msglist button.media--button:has(img)').first();
    await expect(thumb).toBeVisible();
    await thumb.scrollIntoViewIfNeeded();
    const before = await list.evaluate((el) => el.scrollTop);
    await thumb.click();
    const viewer = page.getByRole('dialog', { name: /Visor de/ });
    await expect(viewer).toBeVisible();
    await viewer.getByRole('button', { name: 'Siguiente' }).click();
    await expect(viewer.locator('img.viewer__img')).toBeVisible();
    await viewer.getByRole('button', { name: 'Cerrar visor' }).click();
    await expect(viewer).toBeHidden();
    const after = await list.evaluate((el) => el.scrollTop);
    expect(Math.abs(after - before)).toBeLessThan(4);
  });

  test('visor: Escape cierra', async ({ page }) => {
    test.skip(isMobile(page));
    await msglist(page).evaluate((el) => (el.scrollTop = 560));
    await page.locator('.msglist button.media--button:has(img)').first().click();
    const viewer = page.getByRole('dialog', { name: /Visor de/ });
    await expect(viewer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(viewer).toBeHidden();
  });

  test('cambio de tema claro/oscuro', async ({ page }) => {
    const bg = () => page.evaluate(() => getComputedStyle(document.querySelector('.chat')!).backgroundColor);
    const light = await bg();
    await page.getByRole('button', { name: 'Más opciones' }).last().click();
    await page.getByRole('menuitem', { name: 'Ajustes' }).click();
    await page.getByRole('radio', { name: 'Oscuro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-resolved-theme', 'dark');
    expect(await bg()).not.toBe(light);
    await page.getByRole('button', { name: 'Hecho' }).click();
    await page.reload();
    // la preferencia persiste (solo la preferencia, no el chat)
    await expect(page.locator('html')).toHaveAttribute('data-resolved-theme', 'dark');
    await expect(page.getByTestId('file-input')).toBeAttached();
  });

  test('panel de datos: resumen, participantes, multimedia y estadísticas', async ({ page }) => {
    await page.getByRole('button', { name: /^Datos de la conversación/ }).click();
    const panel = page.getByRole('complementary', { name: 'Datos de la conversación' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Adjuntos disponibles')).toBeVisible();
    await panel.getByRole('tab', { name: /^Multimedia \(\d+\)/ }).click();
    await expect(panel.locator('.media-grid__cell').first()).toBeVisible();
    await panel.getByRole('tab', { name: 'Estadísticas' }).click();
    await expect(panel.getByText('Mensajes por participante')).toBeVisible();
    await expect(panel.getByText(/Datos calculados solo con los mensajes/)).toBeVisible();
  });

  test('exportar copia visual: HTML autónomo y escapado del contenido', async ({ page }) => {
    await page.getByRole('button', { name: 'Más opciones' }).last().click();
    await page.getByRole('menuitem', { name: /Exportar copia visual/ }).click();
    const dl = page.waitForEvent('download');
    await page.getByRole('dialog').getByRole('button', { name: 'Exportar' }).click();
    const file = await dl;
    expect(file.suggestedFilename()).toMatch(/\.html$/);
    const html = (await import('node:fs')).readFileSync(await file.path()!, 'utf8');
    expect(html).toContain('Último mensaje del ejemplo');
    expect(html).not.toMatch(/https?:\/\/(?!example\.com|maps\.google|www\.w3\.org)/);
    expect(html).not.toContain('<script');
  });
});
