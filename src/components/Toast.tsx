import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  clearToasts,
  dismissToast,
  EMPTY_TOASTS,
  failureText,
  pushToast,
  type Toast,
  type ToastTone,
} from '../lib/toast'

/**
 * One place for the app's transient messages.
 *
 * Before this, the board had a status strip, the preferences page had a
 * "flash", three pages rendered a red paragraph next to a dialog's Save
 * button, and half the mutations — archiving a scenario, making one official,
 * deleting a release — said nothing at all. Same job, five appearances, and
 * the one that mattered most on a phone was the one that was missing.
 */

interface ToastApi {
  /** A neutral note: something is underway, or has been copied. */
  say: (text: string) => void
  /** It worked. Clears itself. */
  ok: (text: string) => void
  /** It did not work. Stays until dismissed. */
  fail: (text: string) => void
  /** `fail`, with the thrown cause appended to what was being attempted. */
  failed: (prefix: string, cause: unknown) => void
  /**
   * Something is available, and here is the one thing to do about it. Stays
   * until it is taken or dismissed.
   */
  offer: (text: string, label: string, run: () => void) => void
  clear: () => void
}

const Ctx = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(Ctx)
  if (!api) throw new Error('useToast must be used inside a ToastProvider')
  return api
}

const InsetCtx = createContext<(px: number) => void>(() => {})

/**
 * Lifts the toast stack clear of a page's own fixed bottom bar.
 *
 * The stack lives at the bottom of the screen because that is where a thumb
 * already is — which is also where the preferences page keeps Save and Submit.
 * A confirmation that covers the button that produced it is worse than no
 * confirmation. A page with a bar of its own says how tall it is; the inset
 * goes back to nothing when that page unmounts.
 *
 * One page at a time: two bars on screen at once would have the second
 * overwrite the first, and there is no such page.
 */
export function useToastInset(px: number): void {
  const set = useContext(InsetCtx)
  useEffect(() => {
    set(px)
    return () => set(0)
  }, [px, set])
}

const TONE_STYLE: Record<ToastTone, string> = {
  // Contrast against the card, at 14px: slate-800 13.0:1, emerald-900 10.3:1,
  // red-900 11.0:1 in daylight. Every one of these is a `var(--color-…)` that
  // the dark palette re-points, and the mobile check measures all three again
  // in the dark rather than trusting these numbers to hold.
  info: 'border-slate-300 text-slate-800',
  success: 'border-emerald-600 text-emerald-900',
  error: 'border-red-600 text-red-900',
}

const TONE_MARK: Record<ToastTone, string> = {
  info: 'bg-slate-400',
  success: 'bg-emerald-600',
  error: 'bg-red-600',
}

function ToastStrip({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div
      className={`pointer-events-auto flex items-center gap-2 rounded-lg border-l-4 bg-surface py-1 pl-3 pr-1 shadow-lg ring-1 ring-slate-900/10 ${
        TONE_STYLE[toast.tone]
      }`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_MARK[toast.tone]}`} aria-hidden />
      <span className="min-w-0 flex-1 py-2 text-sm">{toast.text}</span>
      {toast.action && (
        <button
          type="button"
          onClick={toast.action.run}
          // The brand colour as text, which the dark palette re-points for
          // itself — the same arrangement as every other emphasis in the app.
          style={{ color: 'var(--uw-purple-ink)' }}
          className="flex min-h-11 shrink-0 items-center rounded-md px-3 text-sm font-semibold hover:bg-slate-100"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Dismiss: ${toast.text}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-lg text-slate-500 hover:bg-slate-100"
      >
        ×
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(EMPTY_TOASTS)
  const [inset, setInset] = useState(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => setState((s) => dismissToast(s, id)), [])

  const api = useMemo<ToastApi>(
    () => ({
      say: (text) => setState((s) => pushToast(s, text, 'info')),
      ok: (text) => setState((s) => pushToast(s, text, 'success')),
      fail: (text) => setState((s) => pushToast(s, text, 'error')),
      failed: (prefix, cause) => setState((s) => pushToast(s, failureText(prefix, cause), 'error')),
      offer: (text, label, run) => setState((s) => pushToast(s, text, 'info', { label, run })),
      clear: () => setState(clearToasts),
    }),
    [],
  )

  // One timer per message, started when it appears and cancelled if it is
  // dismissed first. Driving this off the rendered list rather than off `push`
  // means a refreshed duplicate gets a fresh id and so a fresh countdown.
  useEffect(() => {
    const live = new Set(state.items.map((t) => t.id))
    for (const [id, handle] of timers.current) {
      if (!live.has(id)) {
        clearTimeout(handle)
        timers.current.delete(id)
      }
    }
    for (const t of state.items) {
      if (t.ttl == null || timers.current.has(t.id)) continue
      timers.current.set(
        t.id,
        setTimeout(() => {
          timers.current.delete(t.id)
          dismiss(t.id)
        }, t.ttl),
      )
    }
  }, [state.items, dismiss])

  useEffect(() => {
    const handles = timers.current
    return () => {
      for (const handle of handles.values()) clearTimeout(handle)
      handles.clear()
    }
  }, [])

  const polite = state.items.filter((t) => t.tone !== 'error')
  const assertive = state.items.filter((t) => t.tone === 'error')

  return (
    <Ctx.Provider value={api}>
      <InsetCtx.Provider value={setInset}>{children}</InsetCtx.Provider>
      {/*
        Bottom of the screen on a phone, where a thumb already is; bottom-right
        on a wide one. `pointer-events-none` on the stack so an idle message
        never swallows a tap meant for what is underneath it — the strips
        themselves take their own events back.

        Two regions, because politeness is a property of the region: an error
        interrupts, a confirmation waits for a gap. They are real boxes rather
        than `display: contents`, which drops an element out of the
        accessibility tree in some browsers and would silence them.
      */}
      <div
        style={inset ? { paddingBottom: inset } : undefined}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 p-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96 print:hidden"
      >
        <div role="status" aria-live="polite" className="flex flex-col gap-2 empty:hidden">
          {polite.map((t) => (
            <ToastStrip key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </div>
        <div role="alert" aria-live="assertive" className="mt-2 flex flex-col gap-2 empty:mt-0 empty:hidden">
          {assertive.map((t) => (
            <ToastStrip key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </div>
      </div>
    </Ctx.Provider>
  )
}
