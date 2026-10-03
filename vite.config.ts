import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base './' so the same build works on GitHub Pages (/aomdiwa/) and on a local preview
export default defineConfig({
  base: './',
  server: { port: Number(process.env.PORT) || 4810, strictPort: true },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'ออมดิวะ — ออมหุ้นอเมริกา',
        short_name: 'ออมดิวะ',
        description: 'เดือนนี้ถึงจังหวะซื้อหุ้นอเมริกาหรือยัง',
        lang: 'th',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0c100d',
        theme_color: '#0c100d',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}', 'icons/*.png'],
        importScripts: ['push-sw.js'],
        navigateFallbackDenylist: [/\/data\//],
        runtimeCaching: [
          // prices change daily: always try the network, fall back to the last copy when offline
          { urlPattern: ({ url }) => url.pathname.includes('/data/'), handler: 'NetworkFirst', options: { cacheName: 'data', networkTimeoutSeconds: 6, expiration: { maxEntries: 80 } } },
          { urlPattern: ({ url }) => url.pathname.includes('/logos/'), handler: 'CacheFirst', options: { cacheName: 'logos', expiration: { maxEntries: 120, maxAgeSeconds: 60 * 86400 } } },
          { urlPattern: ({ url }) => url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com'), handler: 'CacheFirst', options: { cacheName: 'fonts', expiration: { maxEntries: 30, maxAgeSeconds: 365 * 86400 } } },
        ],
      },
    }),
  ],
});
