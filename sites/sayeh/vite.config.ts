import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5176, host: true },
  preview: { port: 4176, host: true },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
});
