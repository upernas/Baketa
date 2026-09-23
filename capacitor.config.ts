import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Empaquetado Android. La app va entera dentro del APK/AAB: no se carga nada
 * desde internet, así que funciona sin conexión y no hay peticiones de red.
 *
 * appId: PENDIENTE DE CONFIRMACIÓN — cámbialo por tu dominio invertido antes de
 * publicar (también en android/app/build.gradle). Una vez subido a Google Play
 * NO se puede cambiar nunca más.
 */
const config: CapacitorConfig = {
  appId: 'com.baketa.app',
  appName: 'Baketa',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  server: {
    // El WebView sirve la app desde https://localhost: contexto seguro para
    // localStorage y la Web Audio API.
    androidScheme: 'https',
  },
};

export default config;
