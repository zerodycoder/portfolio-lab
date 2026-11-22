import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5177, host: true },
  preview: { port: 4177, host: true },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2600,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
});
