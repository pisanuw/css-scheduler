/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { pwa } from './vite-plugins/pwa'
import { supabaseTrimAliases } from './vite-plugins/supabaseTrim'

/**
 * Three vendor chunks, because they change on different clocks.
 *
 * Everything used to be one 585 kB file, which meant every deploy — a
 * one-line fix to a label included — made every returning coordinator
 * re-download React, Supabase and React Query. Those libraries change when
 * `package.json` does, which is rarely; the app changes several times a week.
 * Separating them lets the browser keep the 380 kB that did not move.
 *
 * Grouped rather than split per package: React, the router and the scheduler
 * refer to one another, and cutting between them produces circular chunks that
 * Rollup warns about and that cost a request each to no benefit.
 */
function vendorChunk(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined
  if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//.test(id))
    return 'react'
  if (/node_modules\/(@supabase|iceberg-js|tslib)\//.test(id)) return 'supabase'
  if (/node_modules\/@tanstack\//.test(id)) return 'query'
  return undefined
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    /*
     * The two pages worth having before they are asked for. The dashboard is
     * where every visit lands, and the board is the page this app exists for —
     * and the one most likely to be opened in a meeting room with one bar of
     * signal. The other eleven are cached the first time they are opened.
     */
    pwa({ swSrc: 'src/sw.ts', pages: ['Dashboard', 'Board'] }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Realtime, storage and edge functions, which this app does not use and
      // `supabase-js` constructs anyway. See `vite-plugins/supabaseTrim.ts`.
      ...supabaseTrimAliases(),
    },
  },
  build: {
    rollupOptions: { output: { manualChunks: vendorChunk } },
    /*
     * The default 500 kB warning was firing on the one bundle and there was
     * nothing to learn from it after the first run. Now that the chunks are
     * separate, a chunk over 250 kB means something unexpected has been pulled
     * into one — which is worth being told about.
     */
    chunkSizeWarningLimit: 250,
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
