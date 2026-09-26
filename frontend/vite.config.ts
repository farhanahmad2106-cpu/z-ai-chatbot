import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

// @ts-expect-error - No types available for mjs script
import { copyLegalDocs } from './scripts/copy-legal-docs.mjs'

function legalDocsPlugin() {
  return {
    name: 'legal-docs-sync',
    buildStart() {
      copyLegalDocs()
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      // @ts-expect-error - Rolldown specific option to disable plugin timings warning
      checks: {
        pluginTimings: false
      },
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');
          if (normalized.includes('/node_modules/')) {
            if (normalized.includes('/@zxing/')) {
              return 'zxing-vendor';
            }
            if (
              normalized.includes('/react/') ||
              normalized.includes('/react-dom/')
            ) {
              return 'react-vendor';
            }
            if (normalized.includes('/lucide-react/')) {
              return 'lucide-vendor';
            }
          }
        }
      }
    }
  },
  plugins: [
    legalDocsPlugin(),
    react(),
    babel({
      include: /\.[tj]sx?$/,
      exclude: /node_modules/,
      presets: [reactCompilerPreset()]
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'logo.png', 'pwa-192x192.png', 'pwa-512x512.png', 'legal/*.md'],
      manifest: {
        name: 'Z-SeHealth: AI Food & Chemical Analyzer',
        short_name: 'Z-SeHealth',
        description: 'AI-driven food, chemical, and nutrition intelligence platform',
        theme_color: '#020617',
        background_color: '#020617',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          // 1. Food GET APIs - StaleWhileRevalidate for fast offline lookup + bg refresh
          {
            urlPattern: ({ url, request }) => request.method === 'GET' && /\/api\/(?:foods|search\/food)/i.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'z-sehealth-food-api-v1',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours per offline-first spec
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // 2. Static images & icons - CacheFirst
          {
            urlPattern: ({ request }) => request.destination === 'image' || /\.(?:png|svg|ico|webp)$/i.test(request.url),
            handler: 'CacheFirst',
            options: {
              cacheName: 'z-sehealth-static-v1',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // 3. Google Fonts stylesheets & webfonts - CacheFirst
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'z-sehealth-fonts-v1',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // 4. Public Legal Documents - CacheFirst
          {
            urlPattern: ({ url }) => /\/legal\/.*\.md$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'z-sehealth-legal-v1',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // 5. SECURITY SENSITIVE ROUTES - NetworkOnly (never cache admin, subscription, webhooks, user, auth, payment, compliance, scan)
          {
            urlPattern: ({ url }) => /\/api\/(?:admin|subscription|webhooks|scan|user|auth|payment|compliance)(?:\/.*)?$/i.test(url.pathname),
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      // Prevents the duplicate React context error in memory
      'react': path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
    },
  },
})