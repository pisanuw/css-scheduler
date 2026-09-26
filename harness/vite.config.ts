import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { supabaseTrimAliases } from '../vite-plugins/supabaseTrim'

/**
 * The mobile check builds this, not the app: no Supabase, no router, no
 * credentials, just the components on a phone-sized screen.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react(), tailwindcss()],
  build: { outDir: fileURLToPath(new URL('../dist-harness', import.meta.url)), emptyOutDir: true },
  // The same three clients the app leaves out, so the harness measures what
  // ships rather than a fatter copy of it.
  resolve: { alias: supabaseTrimAliases() },
  /**
   * The page scenes import their column definitions from the pages themselves,
   * so that the check measures what ships rather than a copy of it. A page
   * pulls in `src/lib/supabase.ts`, which refuses to load without these. No
   * request is ever made: a client is constructed and never used.
   */
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://harness.invalid'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('harness-not-a-key'),
  },
})
