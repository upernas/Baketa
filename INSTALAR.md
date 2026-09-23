# Instalar Baketa en el móvil, gratis y sin Google Play

Baketa es una aplicación web instalable: se publica gratis en GitHub Pages y
cada persona la instala desde el navegador con dos toques. Queda con su propio
icono, se abre a pantalla completa y funciona sin conexión.

Es el mismo motor de audio que la versión Android (el de Chrome), así que el
metrónomo suena igual.

## 1. Publicarla (una sola vez, unos 15 minutos)

Solo necesitas una cuenta de [GitHub](https://github.com), que es gratuita y no
pide pagos ni documento de identidad.

1. Crea un repositorio público llamado `baketa` (botón **New**).
2. Sube el contenido de la carpeta del proyecto. Lo más fácil sin usar la
   terminal: en el repositorio vacío, pulsa **uploading an existing file** y
   arrastra los archivos y carpetas, incluida `.github` (en Mac, pulsa
   Cmd+Mayús+. en Finder para ver las carpetas ocultas). GitHub admite 100
   archivos por subida y el proyecto tiene unos 115: sube primero todo menos la
   carpeta `android` y después, en una segunda subida, `android` (o no la
   subas si no vas a hacer el APK).
   No subas `node_modules`, `dist` ni ningún archivo `.jks`.
3. Ve a **Settings → Pages** y en **Source** elige **GitHub Actions**.
4. Ve a la pestaña **Actions**: verás el proceso *Deploy* en marcha. Cuando
   termine en verde (2–3 minutos), la app estará en:

   `https://TU_USUARIO.github.io/baketa/`

Cada vez que subas un cambio, se vuelve a publicar sola. Los móviles que ya la
tengan instalada se actualizan al abrirla con conexión.

## 2. Instalarla en un móvil

**Android (Chrome):** abre el enlace, toca el menú **⋮** y elige **Instalar
aplicación** (en algunos móviles aparece como **Añadir a pantalla de inicio**).

**iPhone (Safari):** abre el enlace, toca **Compartir** y elige **Añadir a
pantalla de inicio**.

Ábrela una vez con conexión; a partir de ahí funciona también en modo avión.

## 3. Datos y privacidad

Cada persona guarda sus grooves y ajustes solo en su propio móvil. Nada se
envía a ningún sitio y no hay cuentas.

Si alguien borra los datos del navegador o desinstala la app, pierde lo que
tenga guardado. Para conservarlo, usa **Ajustes → Exportar** y guarda el archivo.

## Alternativa: archivo APK

La carpeta `android/` permite generar un archivo `.apk` para instalarlo sin
navegador (ver `ANDROID.md`). Hay que instalar Android Studio, y quien lo reciba
tiene que permitir "instalar apps de origen desconocido".

Google exigirá verificar al desarrollador de cualquier APK instalado en móviles
Android certificados: en 2026 solo en Brasil, Indonesia, Singapur y Tailandia, y
desde 2027 en todo el mundo. Para uso personal habrá una cuenta gratuita de
"distribución limitada" (hasta 20 dispositivos, sin cuota ni documento). La
versión web no se ve afectada, por eso es la recomendada.

## Google Play (opcional)

Si algún día quieres publicarla en Google Play, todo está preparado en
`PUBLICAR.md`, `ANDROID.md` y `play/`. No es necesario para usarla.
