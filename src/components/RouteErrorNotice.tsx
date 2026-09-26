import { boundaryMessage, isChunkLoadError, RELOAD_FLAG } from '../lib/chunkError'

/**
 * What a coordinator sees when a page will not load. Separate from the
 * boundary that catches the error on purpose: catching means logging a stack
 * and possibly reloading the document, neither of which a test can do
 * quietly, while this is markup with no side effects until it is tapped. The
 * mobile check renders it directly and measures the thing that ships.
 */
export default function RouteErrorNotice({ error }: { error: unknown }) {
  const { title, detail } = boundaryMessage(error)
  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-700">{detail}</p>
      <button
        type="button"
        onClick={() => {
          /*
           * Tapping this is a deliberate retry, so clear the flag that stops
           * the automatic reload — whatever happens next, the coordinator
           * asked for it and is watching.
           */
          try {
            sessionStorage.removeItem(RELOAD_FLAG)
          } catch {
            /* Nothing recorded, nothing to clear. */
          }
          window.location.reload()
        }}
        style={{ background: 'var(--uw-purple)' }}
        className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-md px-4 text-sm font-semibold text-white sm:w-auto"
      >
        Reload the app
      </button>
      {!isChunkLoadError(error) && (
        <p className="mt-4 text-xs text-slate-700">
          If it keeps happening, tell the scheduler maintainer what you were doing.
        </p>
      )}
    </div>
  )
}
