import type { Banner } from '../lib/online'

/**
 * The strip that says the connection is gone, and then that it is back.
 *
 * A banner rather than a toast, and the difference is the point. Toasts in this
 * app are events — something happened, here is a note about it — and they
 * expire. Being offline is not an event; it is a condition that lasts as long
 * as it lasts, and a coordinator who arrives at the board thirty seconds after
 * the signal dropped needs to be told, which a toast that fired thirty seconds
 * ago cannot do. So this is rendered from state and is on screen for exactly as
 * long as the state holds.
 *
 * It sits below the header and above the page, in the normal flow rather than
 * fixed: on a 375px screen a fixed banner either covers the nav or covers the
 * first row of the page, and there is nothing here worth taking either. It
 * moves the page down by one line while it is there, which is honest — the
 * page really is in a different situation.
 *
 * `role="status"` with `aria-live="polite"`, and no dismiss button. Polite
 * because losing a connection does not interrupt what somebody is in the middle
 * of typing; no dismiss because the state is not the coordinator's to dismiss,
 * and a banner they had already closed would have to come back unbidden the
 * next time a write queued up.
 */
export default function OfflineBanner({ banner }: { banner: Banner | null }) {
  /*
   * The live region is always in the document, even with nothing in it. A
   * region that appears at the same moment as its text is, in several screen
   * readers, a region that is never announced — the text was there when the
   * element was added, so nothing about it changed.
   */
  return (
    <div role="status" aria-live="polite" className="print:hidden">
      {banner && (
        <div
          data-testid="offline-banner"
          className={
            banner.tone === 'warning'
              ? 'border-b border-amber-300 bg-amber-100 text-amber-900'
              : 'border-b border-emerald-300 bg-emerald-100 text-emerald-900'
          }
        >
          <p className="mx-auto flex max-w-7xl items-start gap-2 px-4 py-2 text-sm">
            <span aria-hidden className="pt-0.5 leading-none">
              {banner.tone === 'warning' ? (
                /* A struck-through cloud. Not a word, so it needs no translating. */
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6.5 18h9a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 7.2 9.2A3.5 3.5 0 0 0 6.5 18z" />
                  <path d="M3 3l18 18" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12l5 5L20 6" />
                </svg>
              )}
            </span>
            <span className="min-w-0">{banner.text}</span>
          </p>
        </div>
      )}
    </div>
  )
}
