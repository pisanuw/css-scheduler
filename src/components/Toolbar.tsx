import type { ReactNode } from 'react'

/**
 * The heading and filter row that the five list pages share.
 *
 * They each grew their own, and each was a single non-wrapping flex row with a
 * `w-64` search box pushed to the right by `ml-auto`. At 375px that is 256px of
 * input plus a heading in a row that cannot wrap — the page scrolls sideways,
 * which the mobile rules forbid. The controls were also around 34px tall,
 * against a 44px floor.
 *
 * So: the heading and its count on one line, the controls beneath, wrapping,
 * full-width on a phone and their natural width from `sm` up.
 */
export default function Toolbar({
  title,
  count,
  children,
}: {
  title: ReactNode
  /** The "42 sections" line beside the heading. */
  count?: ReactNode
  /** Filters. Give them `FIELD` or `TOGGLE` so they are big enough to tap. */
  children?: ReactNode
}) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {/* slate-600, not slate-500: on the page's own background the lighter
            one measures 4.49:1 against a 4.5 floor, which the check caught the
            first time this header was ever looked at by something that counts. */}
        {count != null && <span className="text-sm text-slate-600">{count}</span>}
      </div>
      {children && (
        <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>
      )}
    </div>
  )
}

/**
 * A select or text input in a toolbar: the full width of a phone, its own
 * width from `sm` up, and never under the 44px touch floor.
 */
export const FIELD =
  'min-h-11 w-full rounded-md border border-slate-300 bg-surface px-3 text-sm text-slate-900 sm:w-auto'

/** Same, for a search box, which deserves the room when it has it. */
export const SEARCH_FIELD =
  'min-h-11 w-full rounded-md border border-slate-300 bg-surface px-3 text-sm text-slate-900 sm:w-64'

/**
 * A two-state filter as a pill, because a bare checkbox is a 13px target
 * wearing a 44px label and the check measures the control, not the label —
 * as would a thumb.
 */
export function Toggle({
  pressed,
  onChange,
  children,
}: {
  pressed: boolean
  onChange: (next: boolean) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={`flex min-h-11 items-center rounded-full border px-4 text-sm ${
        pressed
          ? 'border-ink bg-ink text-onink'
          : 'border-slate-300 bg-surface text-slate-700 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  )
}
