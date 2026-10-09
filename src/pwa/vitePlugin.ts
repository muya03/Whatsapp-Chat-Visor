import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

/**
 * Genera dist/sw.js a partir de src/pwa/sw.js, inyectando la lista de archivos del app shell
 * y una versión derivada del contenido (cada despliegue con cambios crea una caché nueva).
 */
export function serviceWorkerPlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'wv-service-worker',
    apply: 'build',
    configResolved(c) {
      config = c;
    },
    closeBundle: {
      order: 'post',
      handler() {
        const outDir = resolve(config.root, config.build.outDir);
        const files: string[] = [];
        const walk = (dir: string) => {
          for (const name of readdirSync(dir)) {
            const full = join(dir, name);
            if (statSync(full).isDirectory()) walk(full);
            else files.push(relative(outDir, full).split('\\').join('/'));
          }
        };
        walk(outDir);
        const precache = files
          .filter((f) => f !== 'sw.js' && !f.endsWith('.map') && !f.startsWith('.'))
          .sort()
          .map((f) => `./${f}`);
        precache.unshift('./'); // la raíz también debe responder offline
        const template = readFileSync(resolve(config.root, 'src/pwa/sw.js'), 'utf8');
        const hash = createHash('sha256').update(template); // la versión cambia también si cambia la lógica del SW
        for (const f of precache) if (f !== './') hash.update(f).update(readFileSync(join(outDir, f)));
        const version = hash.digest('hex').slice(0, 12);
        const sw = template.replaceAll('__VERSION__', version).replaceAll('__PRECACHE__', JSON.stringify(precache, null, 2));
        // Defensa: un marcador sin sustituir deja el SW roto (no se registra) y la app sin modo offline.
        if (/__VERSION__|__PRECACHE__/.test(sw)) throw new Error('[sw] marcadores sin sustituir en sw.js');
        writeFileSync(join(outDir, 'sw.js'), sw);
        config.logger.info(`\n[sw] precache de ${precache.length} archivos · versión ${version}`);
      },
    },
  };
}
