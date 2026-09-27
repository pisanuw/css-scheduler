import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

/**
 * What a page says when there is nothing in it yet.
 *
 * Every page here already had one of these, written inline, and they had drifted
 * apart in three ways worth fixing rather than tidying: some were
 * `text-slate-500` and some `text-slate-600`; the report's dropped the page
 * heading, so a coordinator with no scenario yet saw one floating sentence and
 * no title; and the way out was sometimes a proper button and sometimes an
 * underlined link inside the prose — about twenty pixels tall, on a phone, as
 * the only thing to tap.
 *
 * That last one is why this takes the action as *data* rather than as children.
 * You cannot hand it an inline link: it renders a 44px control, or nothing.
 *
 * An empty state is not a failure message. For the coordinator opening this app
 * for the first time the cold start is nothing but empty states, one after
 * another, so each one says what is missing and offers the next move.
 */
export interface EmptyAction {
  label: string
  /** A route, for "go and make one elsewhere". */
  to?: string
  /** A handler, for "make one here" — usually opening this page's own dialog. */
  onClick?: () => void
  /** Greyed out but still explained, e.g. an archived scenario the board locks. */
  disabled?: boolean
  /** The filled purple control for the obvious next move; outlined otherwise. */
  primary?: boolean
}

export default function EmptyState({
  title,
  action,
  children,
}: {
  /**
   * The page's own heading, when the empty state replaces the whole page rather
   * than sitting inside it. A page that loses its title in its empty state
   * leaves the reader to work out what they are looking at.
   */
  title?: string
  action?: EmptyAction
  /** The sentence. Prose, not a label: say what is missing and why it matters. */
  children: ReactNode
}) {
  return (
    <section>
      {title && <h1 className="mb-3 text-xl font-semibold text-slate-900">{title}</h1>}
      <div className="rounded-lg bg-surface p-6 ring-1 ring-slate-200">
        <p className="max-w-2xl text-sm text-slate-600">{children}</p>
        {action && <div className="mt-3">{control(action)}</div>}
      </div>
    </section>
  )
}

/** Both shapes get the same 44px box; only the element differs. */
function control(action: EmptyAction) {
  const style = action.primary ? { background: 'var(--uw-purple)' } : undefined
  const className = action.primary
    ? 'inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-white hover:opacity-90'
    : 'inline-flex min-h-11 items-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50'

  if (action.to)
    return (
      <Link to={action.to} style={style} className={className}>
        {action.label}
      </Link>
    )
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      style={style}
      className={`${className} disabled:opacity-50`}
    >
      {action.label}
    </button>
  )
}
