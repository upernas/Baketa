import { defineConfig } from 'vite';

// base './' permite desplegar en cualquier subruta (GitHub Pages, Netlify, etc.)
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    // Las fuentes se incrustan para que la app funcione sin conexión y como un único HTML.
    assetsInlineLimit: 100_000,
  },
  test: {
    environment: 'node',
  },
});
