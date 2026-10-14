import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import importRecipe from '../api/import-recipe.ts'
import mealDb from '../api/mealdb.ts'
import openFoodFacts from '../api/open-food-facts.ts'

const localRecipeImportApi: Plugin = {
  name: 'local-recipe-import-api',
  configureServer(server) {
    server.middlewares.use('/api/import-recipe', (request, response, next) => {
      if (!['/', ''].includes(request.url?.split('?')[0] ?? '')) {
        next()
        return
      }
      void importRecipe(request, response).catch(next)
    })
  },
  configurePreviewServer(server) {
    server.middlewares.use('/api/import-recipe', (request, response, next) => {
      if (!['/', ''].includes(request.url?.split('?')[0] ?? '')) {
        next()
        return
      }
      void importRecipe(request, response).catch(next)
    })
  },
}

const localFoodApis: Plugin = {
  name: 'local-food-apis',
  configureServer(server) {
    server.middlewares.use('/api/mealdb', (request, response, next) => {
      void mealDb(request, response).catch(next)
    })
    server.middlewares.use('/api/open-food-facts', (request, response, next) => {
      void openFoodFacts(request, response).catch(next)
    })
  },
  configurePreviewServer(server) {
    server.middlewares.use('/api/mealdb', (request, response, next) => {
      void mealDb(request, response).catch(next)
    })
    server.middlewares.use('/api/open-food-facts', (request, response, next) => {
      void openFoodFacts(request, response).catch(next)
    })
  },
}

export default defineConfig({
  plugins: [
    react(),
    localRecipeImportApi,
    localFoodApis,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['recipes-vault-logo.svg', 'icons/*.png'],
      manifest: false,
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /\/assets\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'recipes-vault-static-assets',
              expiration: { maxEntries: 80, maxAgeSeconds: 31_536_000 },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            method: 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'recipes-vault-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 10, maxAgeSeconds: 60 },
            },
          },
        ],
      },
    }),
  ],
})
