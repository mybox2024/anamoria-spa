import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'https://1awf49tg2m.execute-api.us-east-1.amazonaws.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/v1'),
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
  },

  base: '/',
});