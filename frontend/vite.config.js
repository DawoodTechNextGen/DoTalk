import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // injectManifest: uses OUR sw.js as the source.
      // Workbox injects the precache manifest into it at build time.
      // This means we have full control over push notifications.
      strategies: 'injectManifest',
      srcDir: 'src',        // Our sw.js lives in src/
      filename: 'sw.js',    // Source file name
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      manifest: {
        name: 'DoTalk',
        short_name: 'DoTalk',
        description: 'Real-time Chat PWA for TaskDesk portal',
        theme_color: '#3b82f6',
        background_color: '#0f172a',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      injectManifest: {
        // Assets to precache for offline support
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        globIgnores: ['**/node_modules/**'],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
});
