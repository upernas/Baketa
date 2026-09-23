# Avisos de terceros (third-party notices)

Baketa se distribuye bajo licencia MIT (ver `LICENSE`). Este archivo recoge todo
el material de terceros que el proyecto utiliza y las obligaciones que conlleva.

## Lo que se distribuye al publicar la app

La app compilada (`dist/` o `dist-single/baketa.html`) contiene **solo dos cosas
de terceros**: los cuatro archivos de tipografía. Todo lo demás (código, sonidos,
iconos, grooves, textos) es original de este proyecto.

### Tipografías

| Recurso | Origen | Licencia | Uso comercial |
| --- | --- | --- | --- |
| Barlow (400, 600) | [github.com/jpt/barlow](https://github.com/jpt/barlow), vía [@fontsource/barlow](https://fontsource.org/fonts/barlow) | SIL Open Font License 1.1 | Sí |
| Barlow Condensed (600, 700) | [github.com/jpt/barlow](https://github.com/jpt/barlow), vía [@fontsource/barlow-condensed](https://fontsource.org/fonts/barlow-condensed) | SIL Open Font License 1.1 | Sí |

Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow).
Diseñadas por Jeremy Tribby. Subconjunto latino en formato woff2 empaquetado por
Fontsource. El texto completo de la licencia está en `licenses/OFL-1.1-Barlow.txt`
y `licenses/OFL-1.1-Barlow-Condensed.txt`.

Obligaciones de la OFL 1.1, todas cubiertas por este repositorio:

- Incluir el aviso de copyright y el texto de la licencia con cualquier copia de
  las fuentes (también cuando van incrustadas en el HTML). El archivo
  `dist-single/baketa.html` lleva el aviso en una cabecera de comentario.
- No vender las fuentes por separado (sí se puede vender software que las incluya).
- Si se modifican las fuentes, no usar "Barlow" como nombre del resultado.
- El software que las usa puede tener cualquier licencia; la OFL no se contagia.

## Lo que añade la aplicación Android

| Componente | Origen | Licencia | Uso comercial | Obligación |
| --- | --- | --- | --- | --- |
| Capacitor 8 (`@capacitor/core`, `@capacitor/android`) | [capacitorjs.com](https://capacitorjs.com), Drifty Co. | MIT | Sí | Incluir el aviso de copyright: `licenses/MIT-Capacitor.txt` |
| AndroidX (appcompat, core, activity, coordinatorlayout, core-splashscreen, webkit…) | Android Open Source Project, vía Maven de Google | Apache 2.0 | Sí | Incluir la licencia (`licenses/Apache-2.0.txt`) y conservar sus avisos `META-INF` dentro del paquete (no se excluyen) |

Estos componentes solo existen en el `.aab`/`.apk`. La lista resumida está en `NOTICE`
y los textos de licencia también van dentro de la app, en `assets/public/licenses/`.

El icono, la pantalla de inicio y los recursos de Google Play (`play/`) se
generan por código con `scripts/brand-assets.py`: son originales. La plantilla de
Capacitor traía su propio logotipo como icono y splash; se ha sustituido por completo.
El texto de `play/feature-graphic.png` está rasterizado con DejaVu Sans Bold (licencia
Bitstream Vera / dominio público de las ampliaciones DejaVu), que permite usarla en
imágenes comerciales; la fuente no se distribuye.

## Herramientas de desarrollo (no se distribuyen)

Solo se usan para compilar y probar; su código no entra en la app publicada, así
que no generan obligaciones al distribuirla.

| Paquete | Versión | Licencia |
| --- | --- | --- |
| vite (+ rollup, esbuild, postcss y sus dependencias) | 6.x | MIT |
| vitest (+ chai y sus dependencias) | 3.x | MIT |
| @capacitor/cli (+ sus dependencias) | 8.x | MIT |
| typescript | 5.x | Apache-2.0 |
| expect-type (dependencia de vitest) | 1.x | Apache-2.0 |
| picocolors, siginfo | — | ISC |
| source-map-js | — | BSD-3-Clause |

Ninguno de estos paquetes incluye archivo `NOTICE`, por lo que la cláusula 4(d)
de Apache-2.0 no añade requisitos.

## Material original de este proyecto (MIT)

- **Código**: ~8.800 líneas de TypeScript y CSS escritas para el proyecto, sin
  frameworks de interfaz ni librerías en tiempo de ejecución.
- **Sonidos**: los 24 sonidos se sintetizan en el navegador con la Web Audio API
  (osciladores, ruido y filtros) en `src/audio/sounds.ts`. No hay ningún archivo
  de audio ni sample de terceros.
- **Iconos**: rutas SVG dibujadas a mano en `src/ui/dom.ts`. No se usa ninguna
  librería de iconos.
- **Imágenes**: ninguna. El favicon es un SVG en línea en `index.html` y el
  visualizador se genera con SVG por código.
- **Grooves**: transcripciones propias. Los ritmos tradicionales (claves,
  cáscara, campana 12/8, tresillo, habanera…) son de dominio público. Los
  patrones "clásicos" llevan el nombre del estilo y están escritos a partir de
  descripciones didácticas; no reproducen audio ni notación de terceros.
- **Visualizador**: implementación propia inspirada en la idea de polígonos
  concéntricos de [polybeat](https://github.com/chunribu/polybeat) (MIT, Python);
  no se ha usado su código.

## Si añades samples propios

`AudioEngine.loadSample(id, url)` permite sustituir cualquier sonido por un
archivo de audio. Si añades samples de terceros, comprueba su licencia (CC0 o
similar), añádelos a este archivo y guarda su texto de licencia en `licenses/`.
