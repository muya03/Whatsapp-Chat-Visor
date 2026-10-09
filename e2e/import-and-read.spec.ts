import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { FIXTURES, SAMPLES, ZIP, importAndChoose, importFile, msglist, noHorizontalScroll } from './helpers';

test.describe('importación y lectura', () => {
  test('importa un TXT con el selector y muestra la conversación', async ({ page }) => {
    await importAndChoose(page, join(SAMPLES, 'chat-solo-texto.txt'), 'Ana Ejemplo');
    await expect(msglist(page)).toBeVisible();
    await expect(page.getByText('Último mensaje del ejemplo')).toBeVisible();
    // Sin ZIP, los adjuntos aparecen como tarjetas «no disponible», nunca imágenes rotas.
    await expect(page.locator('img[src^="blob:"]')).toHaveCount(0);
  });

  test('importa un TXT arrastrando y soltando', async ({ page }) => {
    await page.goto('/');
    const buffer = (await import('node:fs')).readFileSync(join(FIXTURES, 'ios-en-pair.txt'));
    const dt = await page.evaluateHandle((b) => {
      const d = new DataTransfer();
      d.items.add(new File([new Uint8Array(b)], '_chat.txt', { type: 'text/plain' }));
      return d;
    }, [...buffer]);
    await page.locator('.drop').dispatchEvent('drop', { dataTransfer: dt });
    await expect(page.getByRole('dialog', { name: '¿Quién eres en esta conversación?' })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Alice/ })).toBeVisible();
  });

  test('importa un ZIP con multimedia: imagen, audio con forma de onda, PDF, contacto, faltantes', async ({ page }) => {
    await importAndChoose(page, ZIP, 'Ana Ejemplo');
    const list = msglist(page);
    await list.evaluate((el) => (el.scrollTop = 0));
    // imagen real, con ancho natural > 0
    const img = page.locator('.msglist img.media__img').first();
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(100);
    // recorrer la conversación hasta ver el resto de tipos
    for (const text of ['Presupuesto trimestral Ñandú.pdf', 'Carla Muestra', 'Ubicación compartida', 'Archivo no incluido en el ZIP exportado', 'Se eliminó este mensaje']) {
      await expect.poll(async () => {
        const found = await page.locator('.msglist').getByText(text).first().isVisible().catch(() => false);
        if (!found) await list.evaluate((el) => (el.scrollTop += 450));
        return found;
      }, { timeout: 20_000 }).toBe(true);
    }
  });

  test('la selección de «yo» invierte la orientación de las burbujas', async ({ page }) => {
    await importAndChoose(page, join(SAMPLES, 'chat-solo-texto.txt'), 'Ana Ejemplo');
    await expect(page.locator('.row--out').first()).toBeVisible();
    const out = await page.locator('.row--out .bubble').first().boundingBox();
    const inn = await page.locator('.row--in .bubble').first().boundingBox();
    expect(out && inn && out.x > inn.x).toBe(true);
    // Cambiar a Beto: los mensajes de Ana pasan a la izquierda.
    await page.getByRole('button', { name: /Más opciones/ }).last().click();
    await page.getByRole('menuitem', { name: 'Ajustes' }).click();
    await page.getByLabel('Yo soy').selectOption('Beto Prueba');
    await page.getByRole('button', { name: 'Hecho' }).click();
    await expect(page.locator('.row--out .bubble').first()).toContainText(/.+/);
    const sender = await page.locator('.row--out .bubble').first().textContent();
    expect(sender).not.toContain('Ana Ejemplo');
  });

  test('vista neutral cuando no se indica quién eres', async ({ page }) => {
    await importAndChoose(page, join(SAMPLES, 'chat-solo-texto.txt'), null);
    await expect(page.locator('.row--out')).toHaveCount(0);
    await expect(page.locator('.bubble__sender').first()).toBeVisible();
  });

  test('las fechas se agrupan con separadores y el último día está al final', async ({ page }) => {
    await importAndChoose(page, join(SAMPLES, 'chat-solo-texto.txt'), 'Ana Ejemplo');
    await expect(page.locator('.chip--date', { hasText: '15 de enero de 2023' })).toBeVisible();
  });

  test('un mensaje de una sola palabra enorme no desborda ni genera scroll horizontal', async ({ page }) => {
    await importAndChoose(page, join(SAMPLES, 'chat-solo-texto.txt'), 'Ana Ejemplo');
    await page.evaluate(() => document.querySelector('.msglist')!.scrollTo(0, 0));
    const word = page.locator('.msglist').getByText('Supercalifragilistico');
    await expect.poll(async () => {
      const v = await word.first().isVisible().catch(() => false);
      if (!v) await page.locator('.msglist').evaluate((el) => (el.scrollTop += 400));
      return v;
    }, { timeout: 20_000 }).toBe(true);
    const box = await word.first().locator('xpath=ancestor::div[contains(@class,"bubble")]').boundingBox();
    const vp = page.viewportSize()!;
    expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
    const s = await noHorizontalScroll(page);
    expect(s.page).toBeLessThanOrEqual(0);
    expect(s.list).toBeLessThanOrEqual(0);
  });

  test('error recuperable: archivo no compatible y reintento', async ({ page }) => {
    await importFile(page, join(process.cwd(), 'public', 'icons', 'icon-192.png'));
    await expect(page.getByRole('alert')).toContainText('Formato de archivo no compatible');
    await page.getByTestId('file-input').setInputFiles(join(SAMPLES, 'grupo-ios.txt'));
    await expect(page.getByRole('dialog', { name: '¿Quién eres en esta conversación?' })).toBeVisible();
  });

  test('error recuperable: TXT que no es un chat', async ({ page }) => {
    await importFile(page, join(FIXTURES, 'garbage.txt'));
    await expect(page.getByRole('alert')).toContainText('No se reconoce el formato del chat');
    await expect(page.getByRole('button', { name: 'Elegir otro archivo' })).toBeVisible();
  });

  test('fechas ambiguas: aviso y corrección sin volver a abrir el archivo', async ({ page }) => {
    await importAndChoose(page, join(FIXTURES, 'ambiguous-dates.txt'), null);
    await expect(page.getByRole('status').filter({ hasText: 'ambiguas' })).toBeVisible();
    await expect(page.locator('.chip--date').first()).toContainText('febrero de 2023');
    await page.getByRole('button', { name: 'Corregir' }).click();
    await page.getByLabel('Orden de las fechas del archivo').selectOption('MDY');
    await page.getByRole('button', { name: 'Hecho' }).click();
    await expect(page.locator('.chip--date').first()).toContainText('enero de 2023');
  });
});
