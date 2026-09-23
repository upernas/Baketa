// Genera dist/sw.js con la lista exacta de archivos compilados, para que la
// versión web funcione sin conexión una vez visitada. Ejecutar tras `vite build`.
// (En Android no hace falta: Capacitor ya sirve los archivos desde el propio APK.)
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const dist = 'dist';
const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (entry !== 'sw.js') files.push('./' + relative(dist, p).split('\\').join('/'));
  }
})(dist);

// La versión cambia con el contenido: al desplegar, el service worker se renueva
const hash = createHash('sha256');
for (const f of files) hash.update(readFileSync(join(dist, f.slice(2))));
const version = hash.digest('hex').slice(0, 12);

const sw = `// Generado por scripts/make-sw.mjs — no editar a mano.
const CACHE = 'baketa-${version}';
const FILES = ${JSON.stringify(files, null, 1)};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Primero la caché: la app no necesita red para nada.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(
      (hit) => hit || fetch(e.request).catch(() => caches.match('./index.html')),
    ),
  );
});
`;
writeFileSync(join(dist, 'sw.js'), sw);
console.log(`dist/sw.js (${files.length} archivos, versión ${version})`);
