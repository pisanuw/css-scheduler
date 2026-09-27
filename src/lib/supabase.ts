import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.',
  )
}

/**
 * Typed against `database.types.ts`, which `npm run db:types` generates from the
 * migrations. Without the parameter every row arrives as `any` and the compiler
 * has nothing to say about a column that was renamed or dropped; with it,
 * `from('sections').select('*')` is the section row and a typo in a column name
 * is a build error.
 */
export const supabase = createClient<Database>(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
