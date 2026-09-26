import { fileURLToPath, URL } from 'node:url'

/**
 * Leaves the three Supabase clients this app does not use out of the bundle.
 *
 * `@supabase/supabase-js` is five clients in one package, and its constructor
 * builds a `RealtimeClient` and a `StorageClient` whether or not anything asks
 * for them. That is not something a bundler can prove away: the code is
 * reachable, so it ships — a WebSocket client, a Phoenix channel
 * implementation, a presence layer, an uploader and an edge-function caller,
 * downloaded by every instructor who opens the sign-in page.
 *
 * Aliasing the three package names onto the stand-ins in
 * `src/lib/supabase-trim/` is the smallest honest way to drop them. The
 * alternative — importing `@supabase/postgrest-js` and `@supabase/auth-js`
 * directly and assembling a client by hand — means owning the wiring between
 * auth state and the PostgREST headers, which is exactly the part of
 * `supabase-js` worth keeping.
 *
 * Shared by the app's build and the harness's so that what the mobile check
 * measures is what ships.
 */
export function supabaseTrimAliases(): Record<string, string> {
  const stub = (name: string) =>
    fileURLToPath(new URL(`../src/lib/supabase-trim/${name}.ts`, import.meta.url))
  return {
    '@supabase/realtime-js': stub('realtime'),
    '@supabase/storage-js': stub('storage'),
    '@supabase/functions-js': stub('functions'),
  }
}
