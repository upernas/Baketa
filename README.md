# Baketa

Metrónomo avanzado y caja de ritmos para practicar batería. Funciona en el navegador (móvil, tablet y ordenador), es **gratis, sin anuncios, sin cuentas y de código abierto**.

> Inspirado en la funcionalidad de las apps de metrónomo para bateristas, pero con código, diseño, sonidos y patrones completamente propios.

**Instalarla en el móvil, gratis y sin Google Play:** ver [`INSTALAR.md`](INSTALAR.md).
Se publica en GitHub Pages y se instala desde el navegador en Android o iPhone.

## Qué incluye

**Metrónomo**
- Tempo de 20 a 320 BPM: botones ±1 y ±5 (mantener pulsado para repetir), deslizador, entrada por teclado y *tap tempo*.
- Compases 2/4, 3/4, 4/4, 5/4, 6/8, 7/8, 9/8, 12/8 y cualquier compás personalizado (1–32 / 2, 4, 8, 16). Los compuestos (6/8, 9/8, 12/8…) se cuentan en negras con puntillo.
- Subdivisiones: negras, corcheas, tresillos, semicorcheas, quintillos, seisillos y fusas, con swing (50–75 %) en corcheas o semicorcheas.
- Patrón editable paso a paso con cuatro intensidades (acento, normal, suave, silencio) y **sonido propio por paso** (p. ej. bombo · hi-hat · caja · hi-hat). Plantillas rápidas.
- 24 sonidos: clicks, beeps, electrónico, wood block, batería completa y percusión.

**Polirritmias y visualizador**
- Capas de polirritmia sobre el metrónomo (hasta 6): cada una reparte N golpes iguales en un ciclo de 1–4 compases, con su sonido, volumen, acento y silencio. Presets 3:2, 4:3, 3:4, 5:4, 5:3, 7:4, 3:4:5 y 2:3:4.
- Visualizador propio en SVG, en el metrónomo y en el beat maker: vista circular (cada capa es un polígono inscrito y un punto recorre su perímetro, llegando a cada vértice cuando suena) o vista en líneas.
- Acentos por agrupación en compases irregulares (2+2+3, 3+2+2…).

**Práctica** (pestaña propia; funciona con el metrónomo o con el beat)
- Subida o bajada de tempo: por pasos (±X BPM cada N compases), en N compases o en un tiempo. Tempo inicial opcional, y al llegar mantener, repetir o parar. Indica cuánto tardará en llegar.
- Temporizador: parar tras un tiempo o un número de compases, con cuenta atrás en la barra inferior.
- Compases en silencio fijos (tocar X, callar Y) o aleatorios con probabilidad; se puede silenciar solo el click o también el beat.
- Secuencias de bloques con compases, BPM, tipo de click y subdivisión propios; repeticiones o bucle infinito.
- Panel en vivo con tempo, progreso, compás, tiempo y lo que queda.

**Beat maker**
- Cuadrícula de 17 instrumentos (bombo, caja, aro, palmada, tres hi-hats, ride, crash, tres toms, cencerro, clave, conga, tumba, shaker, wood block).
- Resolución en corcheas, tresillos, semicorcheas, seisillos o fusas; 1–8 compases; swing; bucle; click del metrónomo sincronizado.
- Tres intensidades por nota (normal, acento, ghost), pintar arrastrando con el ratón, deshacer, copiar y vaciar compases.
- Mezclador con volumen y silencio por instrumento. El hi-hat cerrado corta al abierto, como en una batería real.
- El play del beat maker siempre reproduce el beat del editor.

**Grooves**
- 77 patrones con nivel (básico, intermedio, avanzado) en Rock, Funk, Clásicos, Blues, Jazz, Reggae, Brasil, Latin, Salsa, Metal, Electrónica y urbano, Irregulares y Otros.
- Clásicos y avanzados: breaks de estilo Funky Drummer y Amen, half-time shuffles, Motown, train beat, grooves lineales y de paradiddle, Mozambique, songo, baião, blast beats, trap con fusas, compases de 5/4, 7/8, 7/4, 9/8 y 11/8, y polirritmias 3:4 y 4:3.
- Escuchar, abrir en el beat maker, favoritos, búsqueda, filtros por estilo y nivel, y grooves propios (guardar, duplicar, renombrar, eliminar).

**Ajustes**
- Tema oscuro/claro, destello visual en el 1, pantalla siempre encendida, compensación visual de latencia.
- Atajos personalizables (por defecto: `Espacio` play/pausa, `↑/↓` ±1 BPM, `Mayús+↑/↓` ±5, `T` tap, `R` parar).
- Exportar e importar en JSON (copia completa, tus grooves o el groove del editor).

## Uso

```bash
npm install
npm run dev          # servidor de desarrollo
npm test             # pruebas (lógica y planificador de audio)
npm run build        # versión de producción en dist/
npm run build:single # además, dist-single/baketa.html: la app en un único archivo
```

`dist/` es una web estática: se puede publicar gratis en GitHub Pages (hay un workflow en `.github/workflows/deploy.yml`), Netlify, Cloudflare Pages o cualquier hosting. `baketa.html` se puede abrir directamente con doble clic, sin servidor.

Requisitos: Node 20 o superior para compilar. Para usarla, cualquier navegador actual (Chrome, Edge, Firefox, Safari ≥ 15).

## App Android

La misma app se empaqueta para Android con [Capacitor](https://capacitorjs.com) (carpeta `android/`).
Los archivos van dentro del APK, así que funciona sin conexión.

```bash
npm run android:sync     # compila la web y la copia al proyecto Android
npm run android:bundle   # .aab firmado para Google Play
npm run android:apk      # .apk firmado para probar en un móvil
```

- [`ANDROID.md`](ANDROID.md): requisitos, clave de firma, compilación y pruebas en el móvil.
- [`PUBLICAR.md`](PUBLICAR.md): pasos y requisitos de Google Play (opcional; no hace falta para usarla).
- [`play/FICHA-PLAY.md`](play/FICHA-PLAY.md): textos de la ficha y respuestas de las declaraciones.
- [`PRIVACIDAD.md`](PRIVACIDAD.md): política de privacidad.

## Arquitectura

```
src/
  audio/
    transport.ts   planificador con look-ahead (el corazón del timing)
    timer.ts       temporizador en Web Worker con respaldo a setInterval
    timing.ts      cálculo de swing
    engine.ts      AudioContext, buses de mezcla, reproducción programada
    sounds.ts      sonidos sintetizados
  core/            lógica pura sin DOM: tipos, compases, patrones, tap tempo,
                   modo práctica y estado persistente (localStorage)
  data/grooves.ts  biblioteca de grooves
  app/controller.ts  une estado, transporte y audio
  ui/              vistas en TypeScript sin framework (viz.ts: visualizador SVG)
tests/             Vitest
```

Se ha evitado usar un framework de interfaz: la UI es pequeña, y así hay menos dependencias y nada compite con el hilo de audio. El código de `core/` y `audio/` no depende del DOM de la interfaz, por lo que es reutilizable en un futuro envoltorio nativo (Capacitor, Tauri…).

### Cómo se consigue un tempo estable

No se reproduce nada con `setTimeout`/`setInterval`, que en el navegador pueden retrasarse decenas de milisegundos. Se usa el esquema de "dos relojes":

1. Un temporizador impreciso (en un Web Worker) despierta cada ~25 ms.
2. En cada despertar, el planificador calcula todas las notas que caen en los próximos 120 ms y las programa con `AudioBufferSourceNode.start(tiempo)` sobre el reloj del `AudioContext`, que es preciso a nivel de muestra.
3. El instante de cada pulso se obtiene sumando la duración del anterior, así que un cambio de BPM entra en el siguiente pulso sin saltos ni deriva.
4. **Click, beat y polirritmias salen del mismo contador de pulsos**, por lo que no pueden desincronizarse. Los golpes de cada capa se calculan con aritmética entera (golpe k de n en un ciclo de C pulsos), sin error acumulado.
5. Con la pestaña en segundo plano la ventana se amplía a 1,2 s; si el hilo se bloquea, el planificador se recoloca sin disparar ráfagas.
6. La parte visual se sincroniza con lo que se oye descontando la latencia de salida del dispositivo (ajustable en Ajustes).

Las pruebas simulan 10 minutos de reproducción con temporizador irregular y comprueban que cada click cae en su instante exacto (error < 1 ns), que click y beat coinciden y que las capas de 3, 5 y 7 golpes caen en su sitio durante 5 minutos.

## Sonidos y licencias

- **Código:** MIT (ver `LICENSE`).
- **Sonidos:** no hay ningún archivo de audio. Todos se generan por síntesis (osciladores, ruido y filtros) en `src/audio/sounds.ts` al abrir la app, así que forman parte del código y tienen su misma licencia. Para usar samples propios existe `AudioEngine.loadSample(id, url)`; si añades samples de terceros, comprueba que su licencia permita redistribuirlos (p. ej. CC0) e indícalo aquí.
- **Grooves:** transcripciones escritas para este proyecto. Los ritmos tradicionales (claves, cáscara, campana 12/8, tresillo…) son de dominio público. Los "clásicos" llevan el nombre del estilo y se basan en descripciones didácticas; no incluyen audio ni fragmentos de grabaciones.
- **Visualizador:** implementación propia, inspirada en la idea de [polybeat](https://github.com/chunribu/polybeat) (polígonos concéntricos), sin usar su código.
- **Tipografías:** Barlow y Barlow Condensed, de Jeremy Tribby, bajo SIL Open Font License 1.1 (incluidas vía `@fontsource`). Su texto de licencia está en `licenses/`, y el HTML de un solo archivo lleva el aviso en una cabecera de comentario, como exige la OFL.

El inventario completo de material de terceros y sus obligaciones está en [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md). Resumen: solo se distribuyen las tipografías (OFL 1.1); el resto de dependencias (Vite, Vitest, TypeScript) son de desarrollo y no entran en la app.

No hay API keys, analítica ni servicios externos. Los datos se guardan solo en el navegador (`localStorage`).

## Hoja de ruta

- [x] Fase 1 — metrónomo, compases, subdivisiones, acentos, tap tempo, sonidos, diseño adaptable
- [x] Fase 2 — patrones personalizados, sonido por paso, beat maker, swing, mezclador, guardado local
- [x] Fase 3 — biblioteca de grooves, estilos, favoritos, edición
- [x] Fase 4 (parcial) — subida/bajada de tempo (pasos, compases o tiempo), silencios fijos y aleatorios, secuencias con subdivisión por bloque, temporizador, polirritmias con visualizador, exportar/importar
- [ ] Cambiar de groove o de patrón del metrónomo dentro de una secuencia
- [ ] Entrenamiento guiado (retos progresivos)
- [ ] Salida/entrada MIDI (Web MIDI API)
- [x] PWA instalable y funcionamiento sin conexión
- [ ] Contador por voz y más sonidos
- [x] App Android (Capacitor)
- [ ] Apps iOS y escritorio

## Notas de uso

- **iPhone/iPad:** el audio empieza tras el primer toque. En Safari ≥ 16.4 suena aunque el interruptor de silencio esté activado.
- **Auriculares Bluetooth:** tienen latencia; el sonido sigue siendo estable, pero si las luces no coinciden con lo que oyes, ajusta el *ajuste visual* en Ajustes.
- Al cambiar la resolución del beat maker a una más gruesa se pueden perder notas: usa *Deshacer*.
- El botón de play reproduce lo de la sección visible (metrónomo, beat maker, groove seleccionado o la fuente elegida en Práctica). Si suena otra cosa, un toque cambia a lo de la sección actual.
- En compases compuestos (6/8, 9/8, 12/8) el BPM se refiere a la negra con puntillo; en 5/8, 7/8, 11/8… a la corchea.
