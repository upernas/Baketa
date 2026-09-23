# Compilar Baketa para Android

La app Android es la misma aplicación web empaquetada con [Capacitor](https://capacitorjs.com):
los archivos van dentro del APK/AAB y se sirven en local, así que funciona sin
conexión y no hace ninguna petición de red.

## 1. Qué necesitas instalar

| Programa | Versión | Para qué |
| --- | --- | --- |
| [Node.js](https://nodejs.org) | 20 o superior (probado con 22) | Compilar la parte web |
| [Android Studio](https://developer.android.com/studio) | Una versión reciente, compatible con Android Gradle Plugin 8.13 | SDK de Android, emulador y firma |
| JDK | 21 (el que incluye Android Studio) | Capacitor 8 compila con Java 21 |

En Android Studio, en *Settings → Languages & Frameworks → Android SDK*, instala:

- **Android SDK Platform 36** (Android 16), que es el `compileSdk`/`targetSdk`.
- **Android SDK Build-Tools 36**.
- **Android SDK Platform-Tools** (incluye `adb`).

Gradle se descarga solo la primera vez (versión 8.14.3, definida en
`android/gradle/wrapper/gradle-wrapper.properties`).

## 2. Configuración del proyecto

| Qué | Dónde | Valor actual |
| --- | --- | --- |
| Identificador de la app | `capacitor.config.ts` y `android/app/build.gradle` (`namespace` y `applicationId`) | `com.baketa.app`: **cámbialo antes de publicar**, no se puede modificar después |
| Nombre visible | `android/app/src/main/res/values/strings.xml` | Baketa |
| Versión mostrada | `android/app/build.gradle` → `versionName` | 1.0.0 |
| Número de compilación | `android/app/build.gradle` → `versionCode` | 1 (súbelo en cada subida a Play) |
| SDK mínimo / objetivo | `android/variables.gradle` | `minSdk 24`, `compileSdk`/`targetSdk 36` |
| Iconos | `android/app/src/main/res/mipmap-*` | Generados por `python3 scripts/brand-assets.py` |
| Pantalla de inicio | `res/values/styles.xml` y `res/drawable/ic_splash.xml` | Fondo `#161A22` con el logotipo |
| Permisos | `android/app/src/main/AndroidManifest.xml` | Solo `INTERNET` (lo exige el WebView local) |
| Orientación | Libre (vertical y horizontal) | La interfaz se adapta a ambas |

`minSdk 24` (Android 7.0) es el mínimo que fija Capacitor 8 y asegura un WebView
moderno y actualizable desde Play, que es lo que necesita la Web Audio API.

Si cambias el identificador, cámbialo en los tres sitios (`capacitor.config.ts`,
`namespace` y `applicationId` de `android/app/build.gradle`) y mueve
`MainActivity.java` a la carpeta del paquete nuevo (o hazlo con *Refactor → Rename*
en Android Studio).

## 3. Crear la clave de firma (una sola vez)

La clave es **irrecuperable**: si la pierdes no podrás publicar actualizaciones
fácilmente, y si se filtra, otra persona podría firmar apps en tu nombre.

Ejecuta esto **fuera del repositorio**, por ejemplo en tu carpeta personal
(`keytool` viene con el JDK de Android Studio):

```bash
keytool -genkey -v -keystore ~/baketa-release.jks -alias baketa -keyalg RSA -keysize 2048 -validity 10000
```

Te pedirá una contraseña y algunos datos (nombre, organización, país). Apúntalo todo.

Después crea `android/keystore.properties` (está en `.gitignore`; nunca debe subirse):

```properties
storeFile=/ruta/absoluta/a/baketa-release.jks
storePassword=TU_CONTRASEÑA
keyAlias=baketa
keyPassword=TU_CONTRASEÑA_DE_CLAVE
```

En Windows, escribe la ruta con barras normales: `storeFile=C:/Users/tu_usuario/baketa-release.jks`.

Alternativa sin archivo (útil en integración continua): define las variables de
entorno `BAKETA_KEYSTORE`, `BAKETA_STORE_PASSWORD`, `BAKETA_KEY_ALIAS` y
`BAKETA_KEY_PASSWORD`.

**Guarda una copia del `.jks` y de las contraseñas en un sitio seguro.** Con
Play App Signing, Google guarda la clave final de firma y la tuya es la "clave de
subida"; si la pierdes, Google permite solicitar un reemplazo, pero es un trámite lento.

## 4. Compilar

```bash
npm install                # una vez
npm run android:sync       # compila la web y la copia al proyecto Android
npm run android:bundle     # genera el .aab firmado para Google Play
npm run android:apk        # genera un .apk firmado para probar en un móvil
```

En Windows, si `./gradlew` falla, ejecuta desde la carpeta `android`:
`gradlew.bat bundleRelease` o `gradlew.bat assembleRelease`.

Dónde quedan los archivos:

- `.aab`: `android/app/build/outputs/bundle/release/app-release.aab`
- `.apk`: `android/app/build/outputs/apk/release/app-release.apk`

Sin `keystore.properties` la compilación funciona igual, pero el resultado queda
**sin firmar** y Play lo rechazará.

Para instalar el APK en un móvil conectado por USB con la depuración USB activada:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Para el día a día es más cómodo abrir el proyecto en Android Studio
(`npm run android:open`) y pulsar *Run*, que instala una versión de depuración.

## 5. Después de cada cambio en la app web

```bash
npm run android:sync
```

Copia `dist/` dentro de `android/app/src/main/assets/public`. Si no lo ejecutas,
el proyecto Android seguirá con la versión anterior.

Al subir una versión nueva a Play, **incrementa siempre `versionCode`**
(1 → 2 → 3…) y actualiza `versionName` si corresponde.

## 6. Pruebas en el móvil antes de subir a Play

Estas pruebas no se han podido hacer en el entorno donde se preparó el proyecto
(no había SDK de Android). Hazlas tú con el APK:

| Prueba | Qué comprobar |
| --- | --- |
| Instalación e inicio en frío | Abre sin pantalla en blanco; se ve la pantalla de inicio con el logotipo |
| Metrónomo | Suena estable 2–3 minutos; cambiar BPM y compás en marcha no duplica clicks |
| Caja de ritmos y grooves | Suenan, y el click va a tiempo con el beat |
| Botón atrás | Cierra diálogos, vuelve al metrónomo desde otra pestaña y, en el metrónomo, sale |
| Barras del sistema | La barra de reproducción y las pestañas no quedan tapadas (gestos y botones) |
| Rotación | Vertical y horizontal se ven bien |
| Segundo plano y bloqueo | Al volver, la app sigue en el mismo estado y se puede volver a reproducir |
| Sin conexión | En modo avión funciona todo |
| Datos | Guarda un groove, cierra la app, ábrela: sigue ahí |
| Reinstalación | Desinstala e instala de nuevo: arranca limpia y sin errores |

Sobre el segundo plano: la app no tiene servicio en segundo plano ni reproducción
con la pantalla apagada. Android puede pausar o recortar el audio del WebView
cuando la app no está visible, igual que en el navegador; es el comportamiento
esperado para un metrónomo de uso en primer plano. Durante la reproducción la
app pide mantener la pantalla encendida (si está activado en Ajustes).

## 7. Problemas frecuentes

| Síntoma | Causa y solución |
| --- | --- |
| `SDK location not found` | Abre el proyecto una vez en Android Studio, o crea `android/local.properties` con `sdk.dir=/ruta/al/Android/Sdk` |
| `Failed to find Build Tools revision 36` | Instala Build-Tools 36 desde el SDK Manager |
| Error de versión de Java | Usa el JDK 21 de Android Studio (*Settings → Build Tools → Gradle → Gradle JDK*) |
| La app abre en blanco | Falta `npm run android:sync`, o `dist/` está vacío |
| El `.aab` sale sin firmar | Falta `android/keystore.properties` o la ruta del `.jks` es incorrecta |
| Play dice que el `versionCode` ya existe | Incrementa `versionCode` en `android/app/build.gradle` |
| Play rechaza por `targetSdk` | `android/variables.gradle` debe tener `targetSdkVersion = 36` o superior |
