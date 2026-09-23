# Publicar Baketa en Google Play: pasos y requisitos

Requisitos consultados el 21 de septiembre de 2026 en la ayuda oficial de Play Console.
Google los cambia a menudo: revisa los enlaces antes de publicar.

## Pasos

| # | Paso | Dónde | Tiempo aproximado |
| --- | --- | --- | --- |
| 1 | Decidir nombre, identificador (`applicationId`) y email de soporte | `play/FICHA-PLAY.md` | 30 min |
| 2 | Instalar Node.js y Android Studio (SDK 36, JDK 21) | `ANDROID.md` §1 | 1 h |
| 3 | Cambiar el identificador y compilar un APK de prueba | `ANDROID.md` §2 y §4 | 30 min |
| 4 | Probar el APK en tu móvil | `ANDROID.md` §6 | 1 h |
| 5 | Crear la clave de firma y guardarla con copia | `ANDROID.md` §3 | 15 min |
| 6 | Publicar la política de privacidad en una URL pública | `PRIVACIDAD.md` | 30 min |
| 7 | Crear la cuenta de desarrollador (pago único de 25 USD) y verificar identidad | [play.google.com/console](https://play.google.com/console) | De días a semanas |
| 8 | Crear la app y rellenar ficha y declaraciones | Play Console, con `play/FICHA-PLAY.md` | 1–2 h |
| 9 | Generar el `.aab` firmado y subirlo a prueba cerrada | `npm run android:bundle` | 30 min |
| 10 | Prueba cerrada: al menos 12 testers durante 14 días seguidos | Play Console → Pruebas | 14 días o más |
| 11 | Solicitar acceso a producción y enviar a revisión | Play Console → Panel | De días a semanas |
| 12 | Publicada: descargable desde Play | — | — |

El paso 10 solo se aplica a **cuentas personales creadas después del 13 de
noviembre de 2023**. Con cuenta de organización no hace falta, pero exige un
número D-U-N-S.

## Requisitos de Google Play

| Requisito | ¿Te afecta? | Estado | Acción |
| --- | --- | --- | --- |
| [Nivel de API objetivo](https://support.google.com/googleplay/android-developer/answer/11926878): apps nuevas deben apuntar a Android 16 (API 36) desde el 31 ago 2026 | Sí | Hecho: `targetSdk 36` | Ninguna |
| [Formato AAB](https://developer.android.com/guide/app-bundle) obligatorio para apps nuevas | Sí | Configurado (`bundleRelease`) | Generarlo tú (paso 9) |
| [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756) | Sí | Firma de subida configurada | Crear la clave (paso 5) y aceptar Play App Signing al subir |
| [Prueba cerrada con 12 testers durante 14 días](https://support.google.com/googleplay/android-developer/answer/14151465) (cuentas personales nuevas) | Sí, si tu cuenta es personal | Pendiente | Reunir 12 testers con cuenta de Google |
| [Verificación de identidad del desarrollador](https://support.google.com/googleplay/android-developer/answer/10788890) | Sí | Pendiente | Completarla al crear la cuenta |
| [Registro de nombres de paquete](https://support.google.com/googleplay/android-developer/answer/16984799): obligatorio desde el 30 sep 2026 | Sí | Pendiente | Registrar el `applicationId` en Play Console |
| [Política de privacidad y Seguridad de los datos](https://support.google.com/googleplay/android-developer/answer/10787469) (obligatorias aunque no se recojan datos) | Sí | Texto listo | Publicar la URL y rellenar el formulario |
| Clasificación de contenido (las apps sin clasificar no se permiten) | Sí | Respuestas preparadas | Rellenar el cuestionario |
| Permisos: declarar solo los necesarios | Sí | Solo `INTERNET` | Ninguna |
| Público objetivo y política de Familias | Sí | Propuesto: mayores de 13 | Confirmarlo en Play Console |
| Funcionalidad mínima (no ser una web envuelta sin utilidad) | Sí | Funciona sin conexión, contenido propio | Ninguna |
| Anuncios, pagos, cuentas | No | No hay | Declarar "no" |

## Si Play rechaza la subida

| Error | Solución |
| --- | --- |
| "Debes subir un APK o AAB firmado" | Falta `android/keystore.properties` al compilar |
| "El código de versión ya se ha usado" | Sube `versionCode` en `android/app/build.gradle` |
| "Tu app apunta a un nivel de API demasiado bajo" | `targetSdkVersion` en `android/variables.gradle` |
| "El nombre de paquete ya existe" | Otro desarrollador lo usa: cambia el `applicationId` |
| Política de privacidad inaccesible | La URL debe abrirse sin iniciar sesión |

## Después de publicar

- Guarda la clave de firma y las contraseñas en dos sitios distintos.
- En cada versión nueva: `versionCode` + 1, `npm run android:bundle` y sube el `.aab`.
- Revisa *Estadísticas → Android vitals* por si hay cierres inesperados en algún móvil.
- Una vez al año, sube `targetSdk` cuando Google suba el requisito (suele ser a finales de agosto).
