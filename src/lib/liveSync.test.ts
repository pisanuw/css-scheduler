import { describe, expect, it } from 'vitest'
import { syncFeed, watchInterval, WATCH_LIMIT, WATCH_MS, type WatchEntry } from './liveSync'

const ME = 'pisan@uw.edu'
const THEM = 'mashhadi@uw.edu'

let nextId = 100

/** Newest first, as the query orders it. */
function feed(...entries: Partial<WatchEntry>[]): WatchEntry[] {
  return entries.map((e) => ({
    id: e.id ?? nextId--,
    action: e.action ?? 'assigned',
    summary: e.summary ?? 'Rob Nash — CSS 342 A',
    actor_email: e.actor_email === undefined ? THEM : e.actor_email,
  }))
}

describe('watchInterval', () => {
  it('polls on a live connection with nothing in flight', () => {
    expect(watchInterval({ online: true, writing: false })).toBe(WATCH_MS)
  })

  it('does not poll offline', () => {
    expect(watchInterval({ online: false, writing: false })).toBe(false)
  })

  /*
   * The flicker case. A refetch between an optimistic insert and its settle
   * returns rows without the pending assignment, so the pill the coordinator
   * just placed would disappear and come back.
   */
  it('does not poll while a write is outstanding', () => {
    expect(watchInterval({ online: true, writing: true })).toBe(false)
    expect(watchInterval({ online: false, writing: true })).toBe(false)
  })
})

describe('syncFeed', () => {
  it('adopts the newest entry silently on the first look', () => {
    const out = syncFeed(null, feed({ id: 42 }, { id: 41 }), ME)
    expect(out).toEqual({ seen: 42, refetch: false, notice: null })
  })

  /*
   * Zero, not null. A scenario with no history has still been looked at, and
   * the distinction is what makes the *next* change news rather than another
   * silently adopted starting point.
   */
  it('adopts a watermark of zero when there is no history yet', () => {
    expect(syncFeed(null, [], ME)).toEqual({ seen: 0, refetch: false, notice: null })
    const first = syncFeed(0, feed({ id: 1, summary: 'CSS 342 B', action: 'created' }), ME)
    expect(first?.notice).toContain('added CSS 342 B')
  })

  it('does nothing when the feed has not moved', () => {
    expect(syncFeed(42, feed({ id: 42 }, { id: 41 }), ME)).toBeNull()
    expect(syncFeed(42, [], ME)).toBeNull()
  })

  it('names one change by somebody else, in full', () => {
    const out = syncFeed(41, feed({ id: 42, action: 'unassigned', summary: 'Rob Nash — CSS 390 A' }, { id: 41 }), ME)
    expect(out?.seen).toBe(42)
    expect(out?.refetch).toBe(true)
    expect(out?.notice).toBe(
      `${THEM} unassigned Rob Nash — CSS 390 A — the board has been brought up to date.`,
    )
  })

  it('refetches without a notice when the change is the caller’s own', () => {
    const out = syncFeed(41, feed({ id: 42, actor_email: ME }), ME)
    expect(out).toEqual({ seen: 42, refetch: true, notice: null })
  })

  /*
   * `actor_email` is citext: the database considers these one address, so a
   * notice telling this coordinator about their own tap would be a bug.
   */
  it('compares addresses case-insensitively', () => {
    const out = syncFeed(41, feed({ id: 42, actor_email: 'Pisan@UW.edu' }), ME)
    expect(out?.notice).toBeNull()
  })

  it('counts a burst by one person', () => {
    const out = syncFeed(39, feed({ id: 42 }, { id: 41 }, { id: 40 }, { id: 39 }), ME)
    expect(out?.seen).toBe(42)
    expect(out?.notice).toBe(`3 changes by ${THEM} — the board has been brought up to date.`)
  })

  it('counts people rather than naming them when there are several', () => {
    const out = syncFeed(40, feed({ id: 42, actor_email: THEM }, { id: 41, actor_email: 'other@uw.edu' }), ME)
    expect(out?.notice).toBe('2 changes by 2 other people — the board has been brought up to date.')
  })

  it('leaves the caller’s own entries out of the count', () => {
    const out = syncFeed(39, feed({ id: 42, actor_email: ME }, { id: 41 }, { id: 40, actor_email: ME }), ME)
    expect(out?.seen).toBe(42)
    expect(out?.notice).toBe(
      `${THEM} assigned Rob Nash — CSS 342 A — the board has been brought up to date.`,
    )
  })

  /*
   * A full window means the count is a floor, not a total: there may be more
   * behind it. The ids cannot settle the question — the sequence is shared
   * across every scenario — so the wording has to admit the uncertainty.
   */
  it('says "at least" when the window was full', () => {
    const full = feed(...Array.from({ length: WATCH_LIMIT }, (_, i) => ({ id: 60 - i })))
    const out = syncFeed(10, full, ME)
    expect(out?.seen).toBe(60)
    expect(out?.notice).toBe(
      `At least ${WATCH_LIMIT} changes by ${THEM} — the board has been brought up to date.`,
    )
  })

  it('names an actor the log has no address for', () => {
    const out = syncFeed(41, feed({ id: 42, actor_email: null, summary: 'CSS 342 B', action: 'deleted' }), ME)
    expect(out?.notice).toBe(
      'Someone else removed CSS 342 B — the board has been brought up to date.',
    )
  })

  /*
   * A signed-out or still-loading profile has no address to compare against.
   * Everything is then somebody else's, which is the safe reading: a missed
   * notice is a stale board, and a wrongly suppressed one is the bug this
   * whole file exists to fix.
   */
  it('treats every change as somebody else’s when the caller is unknown', () => {
    expect(syncFeed(41, feed({ id: 42, actor_email: THEM }), undefined)?.notice).toContain(THEM)
    expect(syncFeed(41, feed({ id: 42, actor_email: null }), null)?.notice).toContain('Someone else')
  })

  /*
   * Entries older than the watermark are ignored even when they arrive in the
   * same window as new ones — which is the normal case, because the query
   * always asks for the newest six regardless of what has been seen.
   */
  it('only counts entries past the watermark', () => {
    const out = syncFeed(41, feed({ id: 43 }, { id: 42 }, { id: 41 }, { id: 40 }), ME)
    expect(out?.notice).toBe(`2 changes by ${THEM} — the board has been brought up to date.`)
  })
})
