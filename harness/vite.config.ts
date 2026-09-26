import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

/**
 * The mobile check builds this, not the app: no Supabase, no router, no
 * credentials, just the components on a phone-sized screen.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react(), tailwindcss()],
  build: { outDir: fileURLToPath(new URL('../dist-harness', import.meta.url)), emptyOutDir: true },
})
