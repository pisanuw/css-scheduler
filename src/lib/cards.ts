/**
 * How a table row becomes a card.
 *
 * Below `sm` a six-column table is a sideways-scrolling box, which is the one
 * thing the mobile rules forbid outright. So every `DataTable` renders as a
 * list of cards on a phone instead — and a card is not a table row with the
 * borders removed. It has a heading you read first, a badge or two, and the
 * rest as labelled pairs.
 *
 * Which column plays which part is the page's decision, declared on the column
 * itself. The grouping is here, apart from the component, because it is plain
 * data in and plain data out and deserves tests that need no browser.
 */
import type { ReactNode } from 'react'

/**
 * Where a column goes on a card.
 *
 * - `title` — the heading. One per table; the first column if none says so.
 * - `subtitle` — the line under it, unlabelled.
 * - `badge` — sits beside the heading. For short status pills.
 * - `meta` — a labelled pair in the grid. The default.
 * - `action` — a button, pushed to the foot of the card.
 * - `hidden` — not on the card at all. For a column that only repeats
 *   something already shown, or that is too wide to be worth the room.
 */
export type CardSlot = 'title' | 'subtitle' | 'badge' | 'meta' | 'action' | 'hidden'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  /** Table-cell classes. Deliberately not applied to cards: `text-center`
   *  and `whitespace-nowrap` are answers to a table's problems, not a card's. */
  className?: string
  /** Where this column goes on a phone. Defaults to `meta`, except that the
   *  first column becomes the title when no column claims it. */
  card?: CardSlot
  /**
   * What this column shows on a card, when that differs from the table.
   *
   * Needed where a table's columns overlap: the access log's heading is a
   * person's name *or* their address, and the column beside it is their
   * address. Side by side that reads fine; stacked as a heading and the line
   * under it, someone with no name on file gets their address twice. Returning
   * nothing here drops the line.
   */
  renderCard?: (row: T) => ReactNode
}

export interface CardGroups<T> {
  title: Column<T> | null
  subtitle: Column<T> | null
  badges: Column<T>[]
  meta: Column<T>[]
  actions: Column<T>[]
}

/**
 * Sorts columns into the parts of a card.
 *
 * Unannotated columns fall back to something sensible rather than vanishing:
 * the first one is the heading and the rest are labelled pairs, which is what
 * a table already means. A second column claiming `title` is demoted to
 * `meta` instead of quietly overwriting the first — two headings is a bug in
 * the page, and losing a column is a worse way to report it than showing it
 * in the wrong place.
 */
export function groupForCard<T>(columns: Column<T>[]): CardGroups<T> {
  const groups: CardGroups<T> = {
    title: null,
    subtitle: null,
    badges: [],
    meta: [],
    actions: [],
  }
  const unclaimed: Column<T>[] = []

  for (const column of columns) {
    switch (column.card) {
      case 'title':
        if (groups.title) groups.meta.push(column)
        else groups.title = column
        break
      case 'subtitle':
        if (groups.subtitle) groups.meta.push(column)
        else groups.subtitle = column
        break
      case 'badge':
        groups.badges.push(column)
        break
      case 'action':
        groups.actions.push(column)
        break
      case 'hidden':
        break
      case 'meta':
        groups.meta.push(column)
        break
      default:
        unclaimed.push(column)
        break
    }
  }

  // Nothing claimed the heading, so the first column that said nothing takes
  // it — the same column the eye lands on in the table.
  if (!groups.title && unclaimed.length > 0) groups.title = unclaimed.shift()!

  // Keep the page's column order rather than putting the annotated ones first.
  if (unclaimed.length > 0) {
    const order = new Map(columns.map((c, i) => [c.key, i]))
    groups.meta = [...groups.meta, ...unclaimed].sort(
      (a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0),
    )
  }

  return groups
}

/**
 * The plain text of a cell, or null when it is not simply text.
 *
 * Used to decide how much room a value needs. An element with children is
 * followed through, the same way `isBlankCell` does, because a page styling
 * its value does not change how long the value is.
 */
export function textOf(cell: ReactNode): string | null {
  if (cell == null || typeof cell === 'boolean') return ''
  if (typeof cell === 'string') return cell
  if (typeof cell === 'number') return String(cell)
  if (Array.isArray(cell)) {
    const parts = cell.map(textOf)
    return parts.some((p) => p === null) ? null : parts.join('')
  }
  if (typeof cell === 'object' && 'props' in cell) {
    const children = (cell as { props?: { children?: ReactNode } }).props?.children
    return children === undefined ? null : textOf(children)
  }
  return null
}

/**
 * Whether a labelled pair should take the whole width of a card.
 *
 * The pairs sit two to a row, which is about twenty characters each on a
 * phone. A prerequisite paragraph in that space is a column of syllables next
 * to a mostly empty box, so anything long enough to wrap twice gets the row to
 * itself.
 */
export function isWideCell(cell: ReactNode): boolean {
  const text = textOf(cell)
  return text === null ? false : text.trim().length > 36
}

/**
 * True when a cell has nothing to say.
 *
 * A table needs a placeholder in every cell to keep its columns lined up, so
 * pages render `—` for absent values. A card has no columns to line up, and
 * six labels each answered with a dash is worse than five fewer labels. Zero
 * is not blank: nought visits is an answer.
 */
export function isBlankCell(cell: ReactNode): boolean {
  if (cell == null || cell === false || cell === true) return true
  if (typeof cell === 'number') return false
  if (typeof cell === 'string') {
    const text = cell.trim()
    return text === '' || text === '—' || text === '–' || text === '-'
  }
  if (Array.isArray(cell)) return cell.every(isBlankCell)

  // A page that renders its placeholder as `<span className="text-slate-500">—</span>`
  // means the same thing as one that renders `'—'`, and the card should drop
  // both. So look through a wrapper at what it actually puts on the screen.
  //
  // An element with no children is left alone: it draws itself — a rule, an
  // image, a progress bar — and having nothing inside is not having nothing
  // to say.
  if (typeof cell === 'object' && cell !== null && 'props' in cell) {
    const children = (cell as { props?: { children?: ReactNode } }).props?.children
    return children === undefined ? false : isBlankCell(children)
  }

  return false
}
