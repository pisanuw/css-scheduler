/**
 * How a board that somebody else is also editing finds out.
 *
 * The gap this closes is worth stating precisely, because the obvious
 * description of it is wrong. It is *not* an undo problem — undo is
 * `undo_change` in the database and `myLastUndoableIds` already scopes ⌘Z to
 * the caller's own entries, argued in `docs/DESIGN.md` under *Undo*. And it is
 * not a lost-update problem either: two coordinators assigning two different
 * people write two different rows, and `section_instructors` is unique only on
 * `(section_id, instructor_id)`, so **both writes succeed**. Nothing in the
 * database refuses a double-booking; every time conflict in this app is a
 * client-side reading of `src/lib/conflicts.ts`.
 *
 * Which is exactly why staleness matters here more than it would elsewhere.
 * `main.tsx` sets `refetchOnWindowFocus: false`, the board's queries carry a
 * `staleTime`, there is no polling, and realtime is aliased out of the bundle
 * by `vite-plugins/supabaseTrim.ts`. So a board refetches only in response to
 * its *own* mutations — and the conflict panel is computed from that snapshot.
 * A coordinator could be told a slot is clear that somebody filled ten minutes
 * ago, which is not a stale screen but a wrong answer from the one part of the
 * app whose whole job is to be right.
 *
 * The fix does not need realtime back (the trim is worth ~40 kB on a phone) and
 * does not need a version column on the scenario (which would reject the
 * harmless concurrent edit — two coordinators on two different quarters — as
 * readily as the harmful one). `scenario_changes` is already an append-only
 * feed of every board write, with a `bigserial` id, the actor's address and a
 * readable summary, written by trigger. Watching its newest few rows is a
 * few hundred bytes, tells the board *when* to refetch rather than making it
 * refetch blindly, and — because the feed names who did it — lets the notice
 * say whose change just moved the board under the coordinator's thumb.
 *
 * Everything here is pure for the usual reason: the interesting cases are
 * sequences (first look, my own write, someone else's burst, a feed longer than
 * the window) and a test can produce them in a microsecond.
 */
import type { ChangeAction } from '../hooks/scheduling'
import { plural } from './format'

/**
 * One vocabulary for what a change is *called*.
 *
 * Shared with `HistoryPanel` deliberately. The panel and the notice describe
 * the same log entries, and two copies of this table would eventually word the
 * same row two ways — the history saying "removed CSS 342 B" while the toast
 * about it said "deleted".
 */
export const CHANGE_VERB: Record<ChangeAction, string> = {
  created: 'added',
  updated: 'edited',
  deleted: 'removed',
  assigned: 'assigned',
  unassigned: 'unassigned',
}

/** What the watcher reads. Three columns, not the log's whole row. */
export interface WatchEntry {
  id: number
  action: ChangeAction
  summary: string
  actor_email: string | null
}

/**
 * How many entries the watcher asks for.
 *
 * More than one because a burst is normal — accepting five suggestions writes
 * five entries — and the notice should be able to say how many rather than
 * naming only the last. Small because this request runs on a timer on a phone.
 *
 * It cannot be inferred from the ids: `scenario_changes.id` is one sequence
 * across every scenario, so a gap of forty between two entries on this board
 * means thirty-nine changes on somebody else's, not on this one. The rows have
 * to be counted.
 */
export const WATCH_LIMIT = 6

/**
 * How often to ask.
 *
 * Twenty seconds is chosen against the gesture, not against the server: the
 * thing being prevented is a coordinator studying the conflict panel and
 * acting on a picture that is minutes old. Twenty seconds keeps the worst case
 * shorter than the time it takes to read the panel and decide. A tab the
 * browser has backgrounded polls not at all — React Query's
 * `refetchIntervalInBackground` defaults to false — so a phone in a pocket is
 * already quiet without this file doing anything about it.
 */
export const WATCH_MS = 20_000

export interface WatchConditions {
  /** Whether React Query believes there is a connection. */
  online: boolean
  /** Whether a write of this board's own is in flight or queued. */
  writing: boolean
}

/**
 * Whether to poll, and how often.
 *
 * Offline is obvious. `writing` is the one that is not, and it is the reason
 * this is a gate rather than a constant: assign, unassign and move all update
 * the cached board optimistically and invalidate it on settle. A refetch that
 * landed in between would return server rows that do not yet include the
 * pending insert, so the pill the coordinator just placed would vanish and
 * come back a moment later. Pausing the watcher while a write is outstanding
 * costs one tick and removes the flicker; the write's own `onSettled`
 * invalidation brings the board up to date anyway, and the next tick moves the
 * watermark past the entry it wrote.
 */
export function watchInterval(c: WatchConditions): number | false {
  if (!c.online || c.writing) return false
  return WATCH_MS
}

export interface SyncOutcome {
  /** The watermark to remember: the newest entry this look accounted for. */
  seen: number
  /** Whether the cached board is now known to be behind the database. */
  refetch: boolean
  /** What to tell the coordinator, or nothing when there is nobody to name. */
  notice: string | null
}

/**
 * What a look at the feed means.
 *
 * `lastSeen` is null before the first look and a number after it, including
 * zero — the difference matters. A board opened on a scenario with no history
 * adopts a watermark of 0 rather than staying null, so that the *first* change
 * anybody makes afterwards is news rather than being silently adopted as the
 * starting point.
 *
 * Returns null when there is nothing to do, so the caller is one `if`.
 *
 * `feed` arrives newest first, as the query orders it.
 */
export function syncFeed(
  lastSeen: number | null,
  feed: WatchEntry[],
  myEmail: string | null | undefined,
): SyncOutcome | null {
  // The first look establishes where the board came in; it is not news.
  if (lastSeen === null) {
    return { seen: feed[0]?.id ?? 0, refetch: false, notice: null }
  }

  const fresh = feed.filter((e) => e.id > lastSeen)
  if (fresh.length === 0) return null

  return {
    seen: fresh[0]!.id,
    /*
     * True even when every fresh entry is the caller's own. Their board has
     * already caught up through the mutation's invalidation, so this refetch
     * costs a request and changes nothing — except in the case that produced
     * the entries somewhere else entirely: the same person on a second device,
     * or a hand-run SQL fix. Skipping it to save that request would be an
     * optimisation that reintroduces the bug.
     */
    refetch: true,
    notice: noticeFor(fresh, myEmail, fresh.length === WATCH_LIMIT),
  }
}

/** Who to credit when the log has no address for them. */
const SOMEBODY = 'Someone else'

/**
 * The one sentence a coordinator gets when the board moves without them.
 *
 * Their own entries are dropped first, so the notice never tells somebody
 * about their own tap — and if that leaves nothing, there is no notice at all.
 * Addresses are compared case-insensitively because `actor_email` is `citext`:
 * the database considers `Pisan@uw.edu` and `pisan@uw.edu` the same address,
 * and a notice that told this coordinator about their own change because the
 * capitalisation differed would be worse than silence.
 *
 * `truncated` says the window was full, so however many changes are counted
 * here there may be more behind them, and the wording says "at least" rather
 * than claiming a total it cannot know.
 */
function noticeFor(
  fresh: WatchEntry[],
  myEmail: string | null | undefined,
  truncated: boolean,
): string | null {
  /*
   * A caller with no address owns nothing, so everything is somebody else's.
   * Written as a branch rather than folded into the comparison because folding
   * it is where the bug lives: comparing two missing addresses as equal made a
   * trigger-written entry with no actor read as this coordinator's own tap, and
   * suppressed the one notice that most needed showing.
   */
  const mine = myEmail?.toLowerCase() ?? null
  const theirs =
    mine === null ? fresh : fresh.filter((e) => e.actor_email?.toLowerCase() !== mine)
  if (theirs.length === 0) return null

  const tail = 'the board has been brought up to date.'

  // One change can be named in full, which is far more use than a count:
  // "pisan@uw.edu assigned Rob Nash — CSS 342 A" is the thing to go and look at.
  if (theirs.length === 1 && !truncated) {
    const only = theirs[0]!
    return `${only.actor_email ?? SOMEBODY} ${CHANGE_VERB[only.action]} ${only.summary} — ${tail}`
  }

  const count = plural(theirs.length, 'change')
  const actors = new Set(theirs.map((e) => e.actor_email?.toLowerCase() ?? SOMEBODY))
  const who =
    actors.size === 1
      ? (theirs[0]!.actor_email ?? SOMEBODY.toLowerCase())
      : plural(actors.size, 'other person', 'other people')

  return `${truncated ? 'At least ' : ''}${count} by ${who} — ${tail}`
}
