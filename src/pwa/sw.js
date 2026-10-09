/* Service Worker del visor.
 *
 * Qué guarda: SOLO los archivos estáticos de la propia aplicación (app shell), listados en build.
 * Qué NO guarda: nunca interviene en blobs, TXT/ZIP importados ni en nada que no esté en la lista;
 * las conversaciones no pasan por la red ni por Cache Storage.
 *
 * Versionado: cada build genera un VERSION distinto (hash del contenido) y una caché nueva.
 * La versión nueva queda "en espera" hasta que el usuario pulsa «Actualizar» (mensaje SKIP_WAITING),
 * así nunca se mezclan archivos de dos versiones durante una sesión de lectura.
 *
 * Los marcadores de la versión y de la lista de archivos los sustituye src/pwa/vitePlugin.ts durante `vite build`.
 */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE_PREFIX = 'wv-shell-';
const CACHE = CACHE_PREFIX + VERSION;

const abs = (p) => new URL(p, self.location.href).href;
const INDEX = abs('./index.html');

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // cache: 'reload' evita rellenar la caché nueva con respuestas viejas de la caché HTTP.
      cache.addAll(PRECACHE.map((p) => new Request(abs(p), { cache: 'reload' }))),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'GET_VERSION' && event.source) event.source.postMessage({ type: 'VERSION', version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Navegación: siempre el index.html de ESTA versión (funciona sin conexión y no mezcla versiones).
    event.respondWith(
      caches.open(CACHE).then(async (cache) => (await cache.match(INDEX, { ignoreVary: true })) || fetch(req)),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // ignoreVary: los archivos del app shell son estáticos; el Vary (p. ej. Origin) del servidor no debe impedir servirlos offline.
      const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
      if (hit) return hit;
      // Fuera del app shell: red directa, sin guardar nada.
      return fetch(req);
    }),
  );
});
