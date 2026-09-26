/**
 * Stands in for `@supabase/storage-js`. See `README.md` in this directory.
 *
 * Nothing in this app uploads a file. Every export and every printout is
 * generated in the browser and handed straight to the download, which is why
 * `src/lib/download.ts` exists and this does not need to.
 */

const GONE =
  'This build ships no Supabase storage client. Remove the alias in ' +
  'vite-plugins/supabaseTrim.ts if the app now stores files.'

/** Thrown by the real client; re-exported by `supabase-js`, so it must exist. */
export class StorageApiError extends Error {
  status: number

  constructor(message: string, status = 0) {
    super(message)
    this.name = 'StorageApiError'
    this.status = status
  }
}

export class StorageClient {
  // Constructed eagerly by `SupabaseClient`, like the realtime one.
  constructor(_url?: string, _headers?: unknown, _fetch?: unknown, _options?: unknown) {}

  from(_bucket: string): never {
    throw new Error(GONE)
  }

  listBuckets(): never {
    throw new Error(GONE)
  }

  getBucket(_id: string): never {
    throw new Error(GONE)
  }

  createBucket(_id: string, _options?: unknown): never {
    throw new Error(GONE)
  }

  updateBucket(_id: string, _options?: unknown): never {
    throw new Error(GONE)
  }

  deleteBucket(_id: string): never {
    throw new Error(GONE)
  }

  emptyBucket(_id: string): never {
    throw new Error(GONE)
  }
}
