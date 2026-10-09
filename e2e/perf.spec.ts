import { expect, test } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateChat } from '../src/tests/helpers/synthetic';
import { ZIP } from './helpers';

/**
 * Mediciones de rendimiento con chats sintéticos. SOLO Chromium (usa CDP para memoria).
 * Los resultados se escriben en test-results/perf.json y se imprimen; son medidas reales de ESTA máquina,
 * sin limitación de CPU. No se comparan con ningún umbral salvo uno holgado de "no se cuelga".
 */
test.skip(({ browserName, viewport }) => browserName !== 'chromium' || (viewport?.width ?? 0) < 800, 'métricas con CDP, solo escritorio');
test.describe.configure({ mode: 'serial' });

const SIZES = [10_000, 50_000, 100_000];
const dir = join(process.cwd(), 'samples', 'generated');

function sampleFile(n: number): string {
  const f = join(dir, `chat-${n}.txt`);
  if (!existsSync(f)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(f, generateChat({ messages: n }));
  }
  return f;
}

const results: Record<string, unknown>[] = [];

for (const n of SIZES) {
  test(`rendimiento con ${n.toLocaleString('es')} mensajes`, async ({ page, context }) => {
    test.setTimeout(180_000);
    const file = sampleFile(n);
    const sizeMb = readFileSync(file).length / 1048576;
    await page.route('**/__sample.txt', (r) => r.fulfill({ path: file, contentType: 'text/plain' }));
    await page.goto('/');
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const heap = async () => ((await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0) / 1048576;
    const heapBefore = await heap();

    // 1) Importación → primer bloque legible
    const importMs = await page.evaluate(async () => {
      const blob = await (await fetch('/__sample.txt')).blob();
      const file = new File([blob], '_chat.txt', { type: 'text/plain' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.querySelector<HTMLInputElement>('[data-testid=file-input]')!;
      const t0 = performance.now();
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return new Promise<number>((resolve) => {
        const mo = new MutationObserver(() => {
          if (document.querySelector('.bubble')) {
            mo.disconnect();
            resolve(performance.now() - t0);
          }
        });
        mo.observe(document.body, { subtree: true, childList: true });
      });
    });
    await page.getByRole('dialog', { name: '¿Quién eres en esta conversación?' }).getByRole('button', { name: 'Hecho' }).click();
    await page.waitForTimeout(500);
    const domRows = await page.locator('.msglist__row').count();
    const heapAfter = await heap();

    // 2) Búsqueda (incluye 140 ms de antirrebote)
    const searchMs = await page.evaluate(async () => {
      document.querySelector<HTMLButtonElement>('button[aria-label="Buscar"]')?.click();
      await new Promise((r) => setTimeout(r, 100));
      const input = document.querySelector<HTMLInputElement>('.searchbox input')!;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      const t0 = performance.now();
      setter.call(input, 'playa');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return new Promise<number>((resolve) => {
        const check = () => {
          const c = document.querySelector('.searchbox__counter')?.textContent ?? '';
          if (/de/.test(c)) resolve(performance.now() - t0);
          else requestAnimationFrame(check);
        };
        check();
      });
    });
    const counter = await page.locator('.searchbox__counter').textContent();
    await page.getByRole('button', { name: 'Cerrar búsqueda' }).last().click();

    // 3) Salto a fecha (calendario → día a mitad del chat)
    await page.getByRole('button', { name: 'Ir a una fecha' }).click();
    const dlg = page.getByRole('dialog', { name: 'Ir a una fecha' });
    await dlg.getByLabel('Año').selectOption('2022');
    const cell = dlg.getByRole('button', { name: /^15 de .*hay mensajes/ });
    const jumpMs = await (async () => {
      const t0 = Date.now();
      await cell.click();
      await expect(page.locator('.msglist [data-index]').first()).toBeVisible();
      await page.waitForFunction(() => document.querySelectorAll('.msglist .bubble').length > 3);
      return Date.now() - t0;
    })();
    const dayShown = await page.locator('.chip--date').first().textContent();

    // 4) Volver al final con el botón flotante
    const endMs = await (async () => {
      const t0 = Date.now();
      await page.getByRole('button', { name: 'Ir al último mensaje' }).first().click();
      await page.waitForFunction(() => {
        const el = document.querySelector('.msglist')!;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 4;
      });
      return Date.now() - t0;
    })();

    // 5) Fluidez de scroll: 3 s de scroll continuo con rAF, midiendo fotogramas
    const frames = await page.evaluate(async () => {
      const el = document.querySelector('.msglist')!;
      el.scrollTop = el.scrollHeight / 2;
      await new Promise((r) => setTimeout(r, 300));
      const times: number[] = [];
      let last = performance.now();
      const start = last;
      return new Promise<{ fps: number; p95: number; long: number; max: number; frames: number }>((resolve) => {
        const tick = (now: number) => {
          times.push(now - last);
          last = now;
          el.scrollTop += 90;
          if (now - start < 3000) requestAnimationFrame(tick);
          else {
            const s = [...times].sort((a, b) => a - b);
            resolve({
              fps: Math.round((times.length / (now - start)) * 1000),
              p95: Math.round(s[Math.floor(s.length * 0.95)] ?? 0),
              long: times.filter((t) => t > 50).length,
              max: Math.round(s[s.length - 1] ?? 0),
              frames: times.length,
            });
          }
        };
        requestAnimationFrame(tick);
      });
    });

    const row = {
      mensajes: n,
      txtMB: +sizeMb.toFixed(1),
      importHastaPrimerBloque_ms: Math.round(importMs),
      filasDOM: domRows,
      heapAntes_MB: Math.round(heapBefore),
      heapDespues_MB: Math.round(heapAfter),
      busqueda_ms: Math.round(searchMs),
      resultados: counter,
      saltoFecha_ms: jumpMs,
      saltoFechaMostro: dayShown,
      irAlFinal_ms: endMs,
      scroll_fps: frames.fps,
      scroll_p95_frame_ms: frames.p95,
      scroll_frames_gt50ms: frames.long,
      scroll_max_frame_ms: frames.max,
    };
    results.push(row);
    console.log('PERF', JSON.stringify(row));
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/perf.json', JSON.stringify(results, null, 2));

    // Umbrales holgados: solo detectan colapsos, no son objetivos de rendimiento.
    expect(domRows).toBeLessThan(120);
    expect(importMs).toBeLessThan(20_000);
    expect(searchMs).toBeLessThan(5_000);
  });
}

test('coste de abrir y cerrar el visor multimedia (ZIP de ejemplo)', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(ZIP);
  await page.getByRole('dialog').getByRole('button', { name: 'Hecho' }).click();
  await page.waitForTimeout(700); // deja terminar el posicionamiento inicial al final de la conversación
  await page.locator('.msglist').evaluate((el) => (el.scrollTop = 600));
  const thumb = page.locator('.msglist button.media--button:has(img)').first();
  await expect(thumb).toBeVisible(); // las imágenes se descomprimen al montarse la fila (carga diferida)
  const ms = await page.evaluate(async () => {
    const btn = document.querySelector<HTMLButtonElement>('.msglist button.media--button:has(img)')!;
    const times: number[] = [];
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now();
      btn.click();
      await new Promise<void>((res) => {
        const mo = new MutationObserver(() => {
          if (document.querySelector('.viewer__stage img')) { mo.disconnect(); res(); }
        });
        mo.observe(document.body, { subtree: true, childList: true });
        if (document.querySelector('.viewer__stage img')) { mo.disconnect(); res(); }
      });
      times.push(performance.now() - t0);
      document.querySelector<HTMLButtonElement>('button[aria-label="Cerrar visor"]')!.click();
      await new Promise((r) => setTimeout(r, 120));
    }
    return times.map((t) => Math.round(t));
  });
  console.log('PERF visor abrir (10 repeticiones, ms)', JSON.stringify(ms));
  writeFileSync('test-results/perf-viewer.json', JSON.stringify({ abrirVisor_ms: ms }, null, 2));
  await expect(page.locator('.viewer')).toHaveCount(0);
});
