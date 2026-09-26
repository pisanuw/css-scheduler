/**
 * Stands in for `@supabase/realtime-js`. See `README.md` in this directory.
 *
 * Realtime is a WebSocket client, a Phoenix channel implementation and a
 * presence/broadcast layer. This app polls through React Query instead: a
 * teaching schedule is edited by one coordinator at a time and read by
 * instructors who reload, which is not what a persistent socket is for.
 */

const GONE =
  'This build ships no Supabase realtime client. Remove the alias in ' +
  'vite-plugins/supabaseTrim.ts if the app now needs live updates.'

export class RealtimeClient {
  /*
   * `SupabaseClient` constructs this before it knows whether anyone wants it,
   * and calls `setAuth` on every sign-in, sign-out and token refresh. Both
   * have to be silent, or the app cannot start and cannot sign in.
   */
  constructor(_url?: string, _options?: unknown) {}

  setAuth(_token?: string | null): void {}

  connect(): void {}

  disconnect(_code?: number, _reason?: string): void {}

  channel(_name: string, _opts?: unknown): never {
    throw new Error(GONE)
  }

  getChannels(): never {
    throw new Error(GONE)
  }

  removeChannel(_channel: unknown): never {
    throw new Error(GONE)
  }

  removeAllChannels(): never {
    throw new Error(GONE)
  }
}
