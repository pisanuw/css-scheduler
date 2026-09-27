import Dialog from '../Dialog'
import { keyCap, shortcutGroups, type Shortcut } from '../../lib/shortcuts'

/**
 * The list of shortcuts, rendered from the same table the board binds.
 *
 * That is the whole design: the help cannot claim a key that does nothing, and a
 * shortcut cannot be added without turning up here. A hand-kept list would have
 * drifted by the second shortcut.
 *
 * Every shortcut is shown, including the ones that do nothing right now, each
 * with the reason underneath. A help sheet that quietly omitted Add section on a
 * locked scenario would leave somebody pressing `N` and concluding the feature
 * was broken.
 *
 * Unavailability is *not* shown by dimming the text. That was the first attempt
 * and `check:mobile` rejected it: `text-slate-400` on the sheet is 2.6:1 in
 * daylight and 3.5:1 in the dark, against the 4.5 this project holds every
 * string to. Which was the right answer for a better reason than contrast —
 * colour alone is a poor way to say "this does nothing", and it is the rows that
 * do nothing that most need reading. So the label stays legible, the key cap gets
 * a dashed border, and the row carries `aria-disabled` and a sentence.
 */
export default function ShortcutHelp({
  active,
  isApple,
  reasons,
  onClose,
}: {
  /**
   * What works on the board *once this sheet is closed* — so the caller computes
   * it with `helpOpen` and `sheetOpen` false. Passing the board's own live state
   * would grey out every row, since while this sheet is open its own key is the
   * only one bound.
   */
  active: readonly Shortcut[]
  isApple: boolean
  /** Why a given shortcut is unavailable, where there is something to say. */
  reasons: Partial<Record<Shortcut['action'], string>>
  onClose: () => void
}) {
  const groups = shortcutGroups(active)

  return (
    <Dialog
      label="Keyboard shortcuts"
      onClose={onClose}
      className="max-h-[85vh] overflow-y-auto rounded-t-xl sm:max-w-md sm:rounded-xl"
    >
      <div className="flex items-start gap-2 border-b border-slate-200 p-4">
        <h2 className="flex-1 font-semibold text-slate-900">Keyboard shortcuts</h2>
        <button
          type="button"
          onClick={onClose}
          className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-lg text-slate-500 hover:bg-slate-100"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="p-4">
        {groups.map(({ group, items }) => (
          <section key={group} className="mb-4 last:mb-0">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {group}
            </h3>
            <ul>
              {items.map(({ shortcut, available }) => (
                <li
                  key={shortcut.action}
                  aria-disabled={available ? undefined : true}
                  className="flex items-start gap-3 border-b border-slate-100 py-2 last:border-0"
                >
                  <kbd
                    className={`shrink-0 rounded px-2 py-1 font-mono text-xs text-slate-700 ${
                      available
                        ? 'border border-slate-300 bg-slate-50'
                        : 'border border-dashed border-slate-400 bg-transparent'
                    }`}
                  >
                    {keyCap(shortcut, isApple)}
                  </kbd>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="text-slate-700">{shortcut.label}</span>
                    {!available && (
                      <span className="block text-xs text-slate-500">
                        {reasons[shortcut.action] ?? 'Not available right now.'}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/*
          Not a binding, and worth saying anyway: `Dialog` gives every sheet in
          the app Escape, and this is the one place anybody would look it up.
        */}
        <p className="mt-2 border-t border-slate-200 pt-3 text-xs text-slate-500">
          <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono">
            Esc
          </kbd>{' '}
          closes any sheet. Shortcuts pause while one is open, and never fire while
          you are typing in a field.
        </p>
      </div>
    </Dialog>
  )
}
