/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'CutList',
        short_name: 'CutList',
        description: 'Plan sheet-goods cuts, track offcuts and material costs.',
        theme_color: '#127A6E',
        background_color: '#F5F6F8',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        // The engine's .wasm file must be cached for offline use.
        globPatterns: ['**/*.{js,css,html,svg,wasm,woff2}'],
      },
    }),
  ],
  worker: { format: 'es' },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
