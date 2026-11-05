import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Active la mise à jour immédiate dès qu'un nouveau SW est prêt
      // (sans attendre la fermeture des onglets) — utile sur PWA standalone iOS
      // où l'utilisateur reste sur l'app longtemps.
      injectRegister: 'auto',
      strategies: 'generateSW',
      includeAssets: [
        'favicon.ico',
        'favicon.svg',
        'apple-touch-icon-180x180.png',
        'maskable-icon-512x512.png'
      ],
      manifest: {
        name: 'MacroTrack',
        short_name: 'MacroTrack',
        description: 'Suivi de diète et recomposition corporelle',
        // Couleurs CLAIRES pour le splash screen iOS / standalone bg
        theme_color: '#EEF3FE',
        background_color: '#EEF3FE',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['health', 'fitness', 'lifestyle'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      },
      // SW désactivé en dev : évite que le cache PWA serve une ancienne
       // version des assets pendant les itérations. Le SW reste actif en prod.
      devOptions: { enabled: false, type: 'module' }
    })
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  server: { host: true, port: 5173 }
});
