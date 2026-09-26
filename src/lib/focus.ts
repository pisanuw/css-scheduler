/**
 * The arithmetic behind a focus trap, kept apart from the DOM so it can be
 * tested like everything else in `src/lib`.
 *
 * The component's job is to collect the focusable elements in tab order and
 * find where focus currently sits; this decides where Tab should send it.
 */

/**
 * What counts as focusable inside a dialog. `[tabindex="-1"]` is deliberately
 * absent: the dialog container itself carries it so that focus can be parked
 * somewhere harmless on open, and it must not become a Tab stop.
 */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Where Tab should move focus next.
 *
 * `current` is the index of the focused element, or -1 when focus has escaped
 * the dialog — which happens after a click on the backdrop, or when the
 * element that had focus was removed by a re-render. Either way Tab should
 * bring it back to the near end rather than doing nothing.
 *
 * Returns null when there is nothing to focus, so the caller leaves the event
 * alone rather than trapping Tab against an empty dialog.
 */
export function nextTrapIndex(count: number, current: number, backwards: boolean): number | null {
  if (count <= 0) return null
  if (current < 0 || current >= count) return backwards ? count - 1 : 0
  return backwards ? (current - 1 + count) % count : (current + 1) % count
}
