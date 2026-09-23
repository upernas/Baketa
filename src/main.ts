import './fonts.css';
import './styles.css';
import { Controller } from './app/controller';
import { Store } from './core/store';
import { mountApp } from './ui/shell';

const store = new Store();
const app = new Controller(store);
mountApp(app, document.getElementById('app')!);

// Guarda el estado al cerrar o cambiar de pestaña
window.addEventListener('pagehide', () => store.save());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) store.save();
});

// Funcionamiento sin conexión en la versión web. En Android no hace falta:
// Capacitor sirve los archivos desde el propio APK.
const isNative = 'Capacitor' in window;
if ('serviceWorker' in navigator && !isNative && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Sin service worker la app sigue funcionando, pero necesita red para recargar
    });
  });
}

// Acceso para depuración desde la consola
(window as unknown as { baketa: Controller }).baketa = app;
