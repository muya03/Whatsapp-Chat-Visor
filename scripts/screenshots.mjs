// Genera capturas para la documentación y la revisión visual. Requiere `npm run build && npm run preview` activos.
import { chromium, devices } from '@playwright/test';
import { join } from 'node:path';
const ZIP = join(process.cwd(), 'samples', 'Chat de WhatsApp con Ana Ejemplo.zip');
const out = join(process.cwd(), 'docs', 'screenshots');
const base = process.env.BASE_URL ?? 'http://localhost:4173';

const configs = [
  { name: 'desktop-web-light', device: { viewport: { width: 1280, height: 800 } }, theme: 'light', skin: 'web' },
  { name: 'desktop-web-dark', device: { viewport: { width: 1280, height: 800 } }, theme: 'dark', skin: 'web' },
  { name: 'mobile-android-light', device: devices['Pixel 7'], theme: 'light', skin: 'android' },
  { name: 'mobile-android-dark', device: devices['Pixel 7'], theme: 'dark', skin: 'android' },
  { name: 'mobile-ios-light', device: devices['iPhone 14'], theme: 'light', skin: 'ios' },
  { name: 'mobile-ios-dark', device: devices['iPhone 14'], theme: 'dark', skin: 'ios' },
];
const browser = await chromium.launch();
for (const c of configs) {
  const ctx = await browser.newContext({ ...c.device, locale: 'es-ES', colorScheme: c.theme, reducedMotion: 'reduce' });
  await ctx.addInitScript(([t, s]) => localStorage.setItem('wv:prefs', JSON.stringify({ theme: t, skin: s, installHintDismissed: true })), [c.theme, c.skin]);
  const page = await ctx.newPage();
  await page.goto(base);
  if (c.name.endsWith('light') && c.name.startsWith('desktop')) await page.screenshot({ path: join(out, 'landing-desktop.png') });
  if (c.name === 'mobile-android-light') await page.screenshot({ path: join(out, 'landing-mobile.png') });
  await page.getByTestId('file-input').setInputFiles(ZIP);
  const dlg = page.getByRole('dialog', { name: '¿Quién eres en esta conversación?' });
  await dlg.waitFor();
  if (c.name === 'mobile-ios-light') await page.screenshot({ path: join(out, 'whoami-mobile.png') });
  await dlg.getByRole('radio', { name: /Ana Ejemplo/ }).click();
  await dlg.getByRole('button', { name: 'Hecho' }).click();
  await page.waitForTimeout(800);
  // 1) inicio de la conversación
  await page.locator('.msglist').evaluate((el) => (el.scrollTop = 0));
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(out, `${c.name}-1-inicio.png`) });
  // 2) adjuntos
  await page.locator('.msglist').evaluate((el) => (el.scrollTop = 620));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(out, `${c.name}-2-adjuntos.png`) });
  await page.locator('.msglist').evaluate((el) => (el.scrollTop = 1250));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, `${c.name}-3-documentos.png`) });
  await ctx.close();
}
await browser.close();
console.log('capturas en', out);
