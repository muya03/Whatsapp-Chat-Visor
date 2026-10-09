import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ZIP } from './helpers';

/** Auditoría automática con axe-core (WCAG 2.1 A/AA). No sustituye a una revisión manual con lector de pantalla. */
test.skip(({ browserName }) => browserName !== 'chromium', 'axe en Chromium');

async function audit(page: Page, label: string, opts: { exclude?: string[] } = {}) {
  let b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  for (const e of opts.exclude ?? []) b = b.exclude(e);
  const { violations } = await b.analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')} — ${v.help}`);
  expect(summary, `${label}\n${summary.join('\n')}`).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`accesibilidad (${theme})`, () => {
    // Sin animaciones: axe calcula el contraste con los diálogos ya opacos.
    test.use({ colorScheme: theme, reducedMotion: 'reduce' });

    test('pantalla de importación', async ({ page }) => {
      await page.goto('/');
      await audit(page, 'landing');
    });

    test('conversación, diálogos, panel de datos y visor', async ({ page }) => {
      await page.goto('/');
      await page.getByTestId('file-input').setInputFiles(ZIP);
      const who = page.getByRole('dialog', { name: '¿Quién eres en esta conversación?' });
      await expect(who).toBeVisible();
      await audit(page, 'diálogo ¿quién eres?');
      await who.getByRole('radio', { name: /Ana Ejemplo/ }).click();
      await who.getByRole('button', { name: 'Hecho' }).click();
      await page.locator('.msglist').evaluate((el) => (el.scrollTop = 560));
      await expect(page.locator('.msglist button.media--button:has(img)').first()).toBeVisible();
      await audit(page, 'conversación', { exclude: ['.doodle'] });

      await page.getByRole('button', { name: 'Ir a una fecha' }).click();
      await audit(page, 'selector de fecha');
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Más opciones' }).last().click();
      await page.getByRole('menuitem', { name: 'Ajustes' }).click();
      await audit(page, 'ajustes');
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: /^Datos de la conversación/ }).click();
      await audit(page, 'panel de datos');
      await page.getByRole('tab', { name: 'Estadísticas' }).click();
      await audit(page, 'estadísticas');
      await page.keyboard.press('Escape');

      await page.locator('.msglist button.media--button:has(img)').first().click();
      await expect(page.getByRole('dialog', { name: /Visor de/ })).toBeVisible();
      await audit(page, 'visor');
    });
  });
}
