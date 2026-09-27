/// <reference types="vite/client" />

/**
 * The two values the app cannot start without.
 *
 * `vite/client` types `import.meta.env` with an index signature returning
 * `any`, so without this every read of a `VITE_*` value is an `any` that
 * spreads into whatever it touches — here, into the arguments of
 * `createClient`. Naming them costs two lines and makes the check in
 * `src/lib/supabase.ts` a real narrowing from `string | undefined` to `string`
 * rather than a formality over `any`.
 *
 * `vite-plugins/envGuard.ts` is what stops a build proceeding without them;
 * this is only about the types.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string | undefined
  readonly VITE_SUPABASE_ANON_KEY: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
