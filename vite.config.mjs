import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        preventivatore: resolve(__dirname, 'src/renderer/preventivatore.html'),
        editor:         resolve(__dirname, 'src/renderer/editor.html'),
      },
    },
  },
  server: {
    port: 5173,
  },
});
