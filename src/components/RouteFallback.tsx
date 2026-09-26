/**
 * What fills the page while its chunk is on the way.
 *
 * Two things matter and neither is decoration. It must not announce itself
 * instantly — a chunk off a warm cache arrives in single-digit milliseconds,
 * and a spinner that flashes for one frame on every navigation reads as a
 * glitch — and it must reserve roughly the height a page occupies, so the
 * footer and the nav do not jump when the real content lands.
 *
 * The delay is CSS rather than a timer: nothing to schedule, nothing to clean
 * up if the chunk wins the race.
 */
export default function RouteFallback() {
  return (
    <div role="status" aria-live="polite" className="animate-[routefade_1s_ease-out_forwards] opacity-0">
      <span className="sr-only">Loading the page</span>
      <div aria-hidden="true" className="space-y-4">
        <div className="h-7 w-48 rounded bg-slate-200" />
        <div className="h-4 w-72 max-w-full rounded bg-slate-100" />
        <div className="space-y-2 pt-4">
          <div className="h-16 rounded-lg bg-slate-100" />
          <div className="h-16 rounded-lg bg-slate-100" />
          <div className="h-16 rounded-lg bg-slate-100" />
        </div>
      </div>
    </div>
  )
}
