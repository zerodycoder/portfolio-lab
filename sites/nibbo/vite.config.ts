import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5175, host: true },
  preview: { port: 4175, host: true },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
});
