import { describe, expect, it } from 'vitest'
import {
  syncFeed,
  watchInterval,
  SURFACE_TAIL,
  WATCH_LIMIT,
  WATCH_MS,
  type Viewer,
  type WatchEntry,
} from './liveSync'

const ME = 'pisan@uw.edu'
const THEM = 'mashhadi@uw.edu'

let nextId = 100

/**
 * A coordinator on the board: attributed, one scenario, nothing to name.
 *
 * The cases below were written against this surface and still are, so the
 * helper keeps them reading as sentences about the feed rather than about the
 * viewer. The surface-specific cases pass their own.
 */
function board(email: string | null | undefined): Viewer {
  return { email, surface: 'board', named: true }
}

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
    const out = syncFeed(null, feed({ id: 42 }, { id: 41 }), board(ME))
    expect(out).toEqual({ seen: 42, refetch: false, notice: null })
  })

  /*
   * Zero, not null. A scenario with no history has still been looked at, and
   * the distinction is what makes the *next* change news rather than another
   * silently adopted starting point.
   */
  it('adopts a watermark of zero when there is no history yet', () => {
    expect(syncFeed(null, [], board(ME))).toEqual({ seen: 0, refetch: false, notice: null })
    const first = syncFeed(0, feed({ id: 1, summary: 'CSS 342 B', action: 'created' }), board(ME))
    expect(first?.notice).toContain('added CSS 342 B')
  })

  it('does nothing when the feed has not moved', () => {
    expect(syncFeed(42, feed({ id: 42 }, { id: 41 }), board(ME))).toBeNull()
    expect(syncFeed(42, [], board(ME))).toBeNull()
  })

  it('names one change by somebody else, in full', () => {
    const out = syncFeed(41, feed({ id: 42, action: 'unassigned', summary: 'Rob Nash — CSS 390 A' }, { id: 41 }), board(ME))
    expect(out?.seen).toBe(42)
    expect(out?.refetch).toBe(true)
    expect(out?.notice).toBe(
      `${THEM} unassigned Rob Nash — CSS 390 A — the board has been brought up to date.`,
    )
  })

  it('refetches without a notice when the change is the caller’s own', () => {
    const out = syncFeed(41, feed({ id: 42, actor_email: ME }), board(ME))
    expect(out).toEqual({ seen: 42, refetch: true, notice: null })
  })

  /*
   * `actor_email` is citext: the database considers these one address, so a
   * notice telling this coordinator about their own tap would be a bug.
   */
  it('compares addresses case-insensitively', () => {
    const out = syncFeed(41, feed({ id: 42, actor_email: 'Pisan@UW.edu' }), board(ME))
    expect(out?.notice).toBeNull()
  })

  it('counts a burst by one person', () => {
    const out = syncFeed(39, feed({ id: 42 }, { id: 41 }, { id: 40 }, { id: 39 }), board(ME))
    expect(out?.seen).toBe(42)
    expect(out?.notice).toBe(`3 changes by ${THEM} — the board has been brought up to date.`)
  })

  it('counts people rather than naming them when there are several', () => {
    const out = syncFeed(40, feed({ id: 42, actor_email: THEM }, { id: 41, actor_email: 'other@uw.edu' }), board(ME))
    expect(out?.notice).toBe('2 changes by 2 other people — the board has been brought up to date.')
  })

  it('leaves the caller’s own entries out of the count', () => {
    const out = syncFeed(39, feed({ id: 42, actor_email: ME }, { id: 41 }, { id: 40, actor_email: ME }), board(ME))
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
    const out = syncFeed(10, full, board(ME))
    expect(out?.seen).toBe(60)
    expect(out?.notice).toBe(
      `At least ${WATCH_LIMIT} changes by ${THEM} — the board has been brought up to date.`,
    )
  })

  it('names an actor the log has no address for', () => {
    const out = syncFeed(41, feed({ id: 42, actor_email: null, summary: 'CSS 342 B', action: 'deleted' }), board(ME))
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
    expect(syncFeed(41, feed({ id: 42, actor_email: THEM }), board(undefined))?.notice).toContain(THEM)
    expect(syncFeed(41, feed({ id: 42, actor_email: null }), board(null))?.notice).toContain('Someone else')
  })

  /*
   * Entries older than the watermark are ignored even when they arrive in the
   * same window as new ones — which is the normal case, because the query
   * always asks for the newest six regardless of what has been seen.
   */
  it('only counts entries past the watermark', () => {
    const out = syncFeed(41, feed({ id: 43 }, { id: 42 }, { id: 41 }, { id: 40 }), board(ME))
    expect(out?.notice).toBe(`2 changes by ${THEM} — the board has been brought up to date.`)
  })
})

/*
 * The sentence's subject. Four pages share this snapshot, and three of them are
 * not a board — a report that announced "the board has been brought up to date"
 * would send a coordinator looking for something that is not on screen.
 */
describe('syncFeed — what the notice says has moved', () => {
  it('names the surface it was asked about, not the board', () => {
    const one = feed({ id: 42 })
    for (const surface of ['board', 'report', 'comparison', 'check'] as const) {
      const out = syncFeed(41, one, { email: ME, surface, named: true })
      expect(out?.notice).toBe(
        `${THEM} assigned Rob Nash — CSS 342 A — ${SURFACE_TAIL[surface]}`,
      )
    }
  })

  it('names the surface on a counted burst too', () => {
    const out = syncFeed(40, feed({ id: 42 }, { id: 41 }), {
      email: ME,
      surface: 'report',
      named: false,
    })
    expect(out?.notice).toBe(`2 changes to the schedule — ${SURFACE_TAIL.report}`)
  })

  /*
   * The student check is open to any authenticated user, and `scenario_changes`
   * is readable there for the official scenario. Readable is not the same as
   * worth showing: a student needs to know the answer moved, not whose fault it
   * was.
   */
  it('withholds the actor and the section from a viewer who may not be told', () => {
    const out = syncFeed(41, feed({ id: 42 }), { email: 'student@uw.edu', surface: 'check', named: false })
    expect(out?.refetch).toBe(true)
    expect(out?.notice).toBe(`1 change to the schedule — ${SURFACE_TAIL.check}`)
    expect(out?.notice).not.toContain(THEM)
    expect(out?.notice).not.toContain('CSS 342 A')
  })

  it('still says "at least" to an unnamed viewer when the window was full', () => {
    const full = feed(...Array.from({ length: WATCH_LIMIT }, (_, i) => ({ id: 60 - i })))
    const out = syncFeed(10, full, { email: null, surface: 'check', named: false })
    expect(out?.notice).toBe(
      `At least ${WATCH_LIMIT} changes to the schedule — ${SURFACE_TAIL.check}`,
    )
  })

  /*
   * An unnamed viewer is still not told about their own tap. Only coordinators
   * can write, so this cannot happen today — but the suppression must not be
   * something attribution is holding up, or turning `named` off somewhere would
   * quietly turn it into a bug.
   */
  it('still leaves the viewer’s own changes out when they are not named', () => {
    const out = syncFeed(40, feed({ id: 42, actor_email: ME }, { id: 41, actor_email: ME }), {
      email: ME,
      surface: 'check',
      named: false,
    })
    expect(out).toEqual({ seen: 42, refetch: true, notice: null })
  })

  /*
   * `Compare` shows two drafts at once, so an unattributed count would send the
   * coordinator to check the wrong column.
   */
  it('names which draft moved when the page shows more than one', () => {
    const view: Viewer = { email: ME, surface: 'comparison', named: true, where: 'Winter draft' }
    expect(syncFeed(41, feed({ id: 42 }), view)?.notice).toBe(
      `${THEM} assigned Rob Nash — CSS 342 A in Winter draft — ${SURFACE_TAIL.comparison}`,
    )
    expect(syncFeed(40, feed({ id: 42 }, { id: 41 }), view)?.notice).toBe(
      `2 changes by ${THEM} in Winter draft — ${SURFACE_TAIL.comparison}`,
    )
    expect(
      syncFeed(41, feed({ id: 42 }), { ...view, named: false })?.notice,
    ).toBe(`1 change to the schedule in Winter draft — ${SURFACE_TAIL.comparison}`)
  })

  /*
   * A scenario whose name has not loaded yet leaves the clause out rather than
   * printing "in undefined" — the sentence is still true without it.
   */
  it('leaves the draft clause out when there is no name to use', () => {
    const out = syncFeed(41, feed({ id: 42 }), {
      email: ME,
      surface: 'comparison',
      named: true,
      where: undefined,
    })
    expect(out?.notice).toBe(
      `${THEM} assigned Rob Nash — CSS 342 A — ${SURFACE_TAIL.comparison}`,
    )
  })
})
