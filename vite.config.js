// vite.config.js — Anamoria SPA
// v1.1 — PWA Conversion (April 23, 2026)
// Changes from v1.0:
//   - Added vite-plugin-pwa (VitePWA) plugin
//   - Web app manifest config (name, icons, theme, scope, id)
//   - Workbox precache config with navigateFallback
//   - No changes to existing proxy, build, or base config

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'butterfly.svg'
      ],
      manifest: {
        id: '/',
        name: 'Anamoria',
        short_name: 'Anamoria',
        description: 'A quiet space to preserve memories of someone you love',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#faf9f7',
        theme_color: '#5b7a65',
        orientation: 'portrait',
        categories: ['lifestyle', 'health'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: []
      }
    })
  ],

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
