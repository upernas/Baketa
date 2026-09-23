// Genera dist-single/baketa.html: la app entera en un único archivo HTML
// (útil para abrirla sin servidor o compartirla). Ejecutar tras `vite build`.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = readdirSync(join(dist, 'assets'));

for (const file of assets) {
  const code = readFileSync(join(dist, 'assets', file), 'utf8');
  const ref = new RegExp(`<script[^>]*src="\\./assets/${file.replace('.', '\\.')}"[^>]*></script>`);
  const css = new RegExp(`<link[^>]*href="\\./assets/${file.replace('.', '\\.')}"[^>]*>`);
  if (file.endsWith('.js')) {
    // El script va al final del body para que #app exista al ejecutarse
    html = html.replace(ref, '');
    const safe = code.replace(/<\/script/gi, '<\\/script');
    html = html.replace('</body>', () => `<script type="module">${safe}</script>\n</body>`);
  } else if (file.endsWith('.css')) {
    html = html.replace(css, () => `<style>${code}</style>`);
  }
}

if (/\.\/assets\//.test(html)) throw new Error('Quedan referencias a ./assets sin incrustar');

// Las tipografías van incrustadas en el archivo: la OFL obliga a distribuir el
// aviso de copyright y la licencia junto a ellas.
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const banner = `<!--
  Baketa v${version} — metrónomo y caja de ritmos. Código: MIT.
  https://github.com/ (ver README.md y THIRD-PARTY-NOTICES.md)

  Tipografías incrustadas: Barlow y Barlow Condensed.
  Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow).
  Licenciadas bajo la SIL Open Font License, Version 1.1:
  https://openfontlicense.org  ·  texto completo en licenses/OFL-1.1-Barlow.txt

  Sonidos sintetizados por código; sin samples de terceros.
-->
`;
html = html.replace('<!doctype html>', `<!doctype html>\n${banner}`);
mkdirSync('dist-single', { recursive: true });
writeFileSync(join('dist-single', 'baketa.html'), html);
console.log(`dist-single/baketa.html (${(html.length / 1024).toFixed(0)} KB)`);
