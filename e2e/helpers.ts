import { expect, type Page } from '@playwright/test';
import { join } from 'node:path';

export const SAMPLES = join(process.cwd(), 'samples');
export const FIXTURES = join(process.cwd(), 'src', 'tests', 'fixtures');
export const ZIP = join(SAMPLES, 'Chat de WhatsApp con Ana Ejemplo.zip');

/** Importa con el selector de archivos real (input[type=file]). */
export async function importFile(page: Page, path: string) {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(path);
}

/** Importa y cierra «¿Quién eres?» eligiendo `me` (o dejando la vista neutral). */
export async function importAndChoose(page: Page, path: string, me: string | null = null) {
  await importFile(page, path);
  const dialog = page.getByRole('dialog', { name: '¿Quién eres en esta conversación?' });
  await expect(dialog).toBeVisible();
  if (me) await dialog.getByRole('radio', { name: new RegExp(me) }).click();
  await dialog.getByRole('button', { name: 'Hecho' }).click();
  await expect(dialog).toBeHidden();
}

/** En móvil la lista va primero; esto garantiza estar dentro de la conversación. */
export const msglist = (page: Page) => page.locator('.msglist');

export async function noHorizontalScroll(page: Page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const list = document.querySelector('.msglist');
    return {
      page: de.scrollWidth - de.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
      list: list ? list.scrollWidth - list.clientWidth : 0,
    };
  });
}
