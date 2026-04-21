import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Files in public/ that should be precached by the service worker
      // (so they load instantly and work offline). These are the static icons
      // the browser needs to render the tab and home-screen entries.
      includeAssets: [
        'favicon.svg',
        'favicon-32.png',
        'apple-touch-icon.png'
      ],
      manifest: {
        name: '藥師預假系統',
        short_name: '預假系統',
        description: '藥局預假線上系統 — 每月第一週六 20:00 開放',
        lang: 'zh-TW',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        // Cyan brand color. Tints the mobile browser address bar and the
        // splash screen background when the app launches from home screen.
        background_color: '#0891b2',
        theme_color: '#0891b2',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            // Maskable icon: Android crops this to circle/squircle, so the
            // artwork inside has built-in 80% safe-zone padding. Required
            // for the "installable" PWA badge in Chrome.
            src: 'pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ]
})
