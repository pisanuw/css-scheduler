import { useEffect, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { FOCUSABLE_SELECTOR, nextTrapIndex } from '../lib/focus'

/**
 * Every modal in the app: the assign sheet, the section editor, the suggestion
 * list, the scenario and cycle dialogs.
 *
 * They each had a different subset of the behaviour — one closed on Escape,
 * one closed on a backdrop tap, none of them did anything about focus. A
 * keyboard user could Tab straight out of an open dialog into the page behind
 * it and carry on pressing buttons they could not see. This is that behaviour
 * in one place:
 *
 * - Escape closes, and a backdrop tap closes.
 * - Focus moves into the dialog on open and returns to whatever opened it on
 *   close, so the coordinator is not dropped at the top of the document.
 * - Tab cycles inside the dialog.
 * - The page behind it does not scroll, which on a phone is the difference
 *   between a sheet and a sheet that slides off while you scroll it.
 *
 * Focus lands on the dialog itself, not on its first field, on purpose: these
 * are phone-first sheets, and a keyboard springing up unbidden over the list
 * you were about to read is worse than a tap. Pass `initialFocus` where a
 * field really is the point.
 */
export default function Dialog({
  label,
  describedBy,
  onClose,
  initialFocus,
  className = '',
  children,
}: {
  /** What the dialog is for, announced on open. */
  label: string
  describedBy?: string
  onClose: () => void
  initialFocus?: RefObject<HTMLElement | null>
  /** Classes for the panel. Layout of the backdrop is fixed. */
  className?: string
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Captured on mount, before focus moves, so it is the control that opened us.
  const openerRef = useRef<Element | null>(null)

  useEffect(() => {
    openerRef.current = document.activeElement
    const panel = panelRef.current
    if (initialFocus?.current) initialFocus.current.focus()
    else panel?.focus()

    return () => {
      const opener = openerRef.current
      // Only take focus back if it is still inside the dialog being torn down;
      // if something else has claimed it in the meantime, leave it alone.
      if (opener instanceof HTMLElement && document.body.contains(opener)) opener.focus()
    }
    // Mount and unmount only: re-running this would steal focus mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The page behind must not scroll under the sheet.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        // offsetParent is null for anything display:none — a collapsed
        // <details>, or a field the form has hidden for the current mode.
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      const current = items.indexOf(document.activeElement as HTMLElement)
      const next = nextTrapIndex(items.length, current, e.shiftKey)
      if (next === null) return
      e.preventDefault()
      items[next]!.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        // mousedown, not click: a click that started inside the panel and
        // finished on the backdrop — dragging to select text — is not a
        // request to close.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`w-full bg-white shadow-xl outline-none ${className}`}
      >
        {children}
      </div>
    </div>
  )
}
