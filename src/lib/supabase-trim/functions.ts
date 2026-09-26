/**
 * Stands in for `@supabase/functions-js`. See `README.md` in this directory.
 *
 * There are no edge functions in this project. The work that might have needed
 * one — the conflict engine, the suggestions, the reports — is pure TypeScript
 * that runs in the page and is unit-tested there, and everything that must not
 * be decided by the client is decided by row-level security in the database.
 */

const GONE =
  'This build ships no Supabase functions client. Remove the alias in ' +
  'vite-plugins/supabaseTrim.ts if the app now calls an edge function.'

export class FunctionsError extends Error {
  context: unknown

  constructor(message: string, name = 'FunctionsError', context?: unknown) {
    super(message)
    this.name = name
    this.context = context
  }
}

export class FunctionsFetchError extends FunctionsError {
  constructor(context?: unknown) {
    super('Failed to send a request to the Edge Function', 'FunctionsFetchError', context)
  }
}

export class FunctionsRelayError extends FunctionsError {
  constructor(context?: unknown) {
    super('Relay Error invoking the Edge Function', 'FunctionsRelayError', context)
  }
}

export class FunctionsHttpError extends FunctionsError {
  constructor(context?: unknown) {
    super('Edge Function returned a non-2xx status code', 'FunctionsHttpError', context)
  }
}

/**
 * The real one is an enum of region names. Nothing here reads it — it exists
 * because `supabase-js` re-exports it, and a missing re-export is a build
 * failure rather than a runtime one.
 */
export const FunctionRegion = Object.freeze({})

export class FunctionsClient {
  // Lazily constructed by `SupabaseClient.functions`, unlike the other two.
  constructor(_url?: string, _options?: unknown) {}

  setAuth(_token: string): void {}

  invoke(_name: string, _options?: unknown): never {
    throw new Error(GONE)
  }
}
