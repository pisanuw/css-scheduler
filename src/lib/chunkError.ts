/**
 * What to do when a page's chunk will not load.
 *
 * Splitting the bundle moves a failure that used to be impossible into the
 * middle of a navigation: the app is running, the coordinator taps Board, and
 * the fetch for the board chunk fails. `React.lazy` rethrows that during
 * render, which without a boundary is a white screen.
 *
 * There are two causes and they want opposite handling.
 *
 * A *stale deploy*. Every asset is named by its hash, so a deploy replaces
 * `Board-DkQ2.js` with `Board-9fLp.js`, and a tab open from before it holds an
 * entry chunk that asks for the old name. Netlify usually keeps the old file
 * addressable — measured, not assumed: the bundle from the previous deploy
 * still answered 200 after this one shipped — so this is rarer here than on a
 * host that purges. It still happens when a deploy is deleted, rolled back or
 * purged, and when it does the page simply never appears. Reloading picks up
 * the new index.html and everything follows. So: reload, once, automatically.
 *
 * A *dead connection* looks identical from here — both surface as a module
 * fetch rejection — but reloading on a phone with no signal replaces a working
 * app and a retry button with a browser error page. So the auto-reload fires
 * at most once per document: if we come back and the chunk still will not
 * load, the cause was not the deploy, and the coordinator gets something to
 * tap instead of a loop.
 *
 * Both rules are decisions rather than plumbing, so they live here as pure
 * functions and the boundary in `RouteErrorBoundary` only obeys them.
 */

/**
 * Browsers disagree about the wording, so this matches on the shapes seen in
 * the wild rather than on one string. Firefox and Safari do not even agree on
 * whether it is a `TypeError`.
 */
const CHUNK_MESSAGES = [
  'failed to fetch dynamically imported module', // Chrome, Edge
  'error loading dynamically imported module', // Firefox
  'importing a module script failed', // Safari
  'failed to load module script', // Chrome, when the server answers with HTML
  'loading chunk', // webpack-era wording, still emitted by some proxies
  'loading css chunk',
]

export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false
  const name = typeof err === 'object' && 'name' in err ? String((err as Error).name) : ''
  if (name === 'ChunkLoadError') return true
  const message =
    typeof err === 'string'
      ? err
      : typeof err === 'object' && 'message' in err
        ? String((err as Error).message)
        : ''
  const lower = message.toLowerCase()
  return CHUNK_MESSAGES.some((m) => lower.includes(m))
}

/**
 * The key a reload flag is stored under. `sessionStorage` rather than a module
 * variable, because the whole point is to survive the reload we are about to
 * trigger — and rather than `localStorage`, because a reload that failed six
 * weeks ago must not stop today's from being tried.
 */
export const RELOAD_FLAG = 'css-scheduler:chunk-reloaded'

/**
 * Reload only for a chunk failure, and only if this document has not already
 * tried. Anything else — a real bug thrown while the page renders — is not
 * something a reload fixes, and reloading would hide it.
 */
export function shouldAutoReload(err: unknown, alreadyReloaded: boolean): boolean {
  return isChunkLoadError(err) && !alreadyReloaded
}

/**
 * What the boundary says. A stale deploy and a dead connection need different
 * words: one is over and done with, the other is worth trying again.
 */
export function boundaryMessage(err: unknown): { title: string; detail: string } {
  if (isChunkLoadError(err)) {
    return {
      title: 'This page could not be loaded',
      detail:
        'The app was probably updated while this tab was open, or the connection dropped. Reloading should fix it.',
    }
  }
  return {
    title: 'Something went wrong on this page',
    detail: 'The rest of the app is still fine. Reloading usually clears it.',
  }
}
