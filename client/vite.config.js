import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'BusinessX',
        short_name: 'BusinessX',
        start_url: '/',
        display: 'standalone',
        background_color: '#f4f5f7',
        theme_color: '#0f172a',
      },
      workbox: {
        // precache everything, including the OCR engine + language data
        globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm,gz,mjs}'],
        maximumFileSizeToCacheInBytes: 60 * 1024 * 1024,
        navigateFallback: '/index.html',
      },
    }),
  ],
});