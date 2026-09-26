import { themeLabel } from '../lib/theme'
import type { ThemeState } from '../hooks/useTheme'

/**
 * One button, three states: follow the device, force light, force dark.
 *
 * A switch would be smaller, but a switch cannot say "follow the device" —
 * and following the device is the state most people should be in and the one
 * the app starts in. Three states need a cycle, and a cycle needs to say out
 * loud where it is, which is what the label does.
 *
 * The icon is the theme as it currently looks (sun or moon) with a dot under
 * it when that is the device's doing rather than a choice: enough to tell the
 * two apart at a glance without a second control.
 *
 * The state belongs to `useTheme` in `App`, because the sign-in page needs the
 * theme applied without having anywhere to put a button.
 */
export default function ThemeToggle({
  preference,
  resolved,
  cycle,
  className = '',
}: ThemeState & { className?: string }) {
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={themeLabel(preference, resolved)}
      title={themeLabel(preference, resolved)}
      className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-white/90 hover:bg-white/10 ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        {resolved === 'dark' ? (
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" strokeLinejoin="round" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" strokeLinecap="round" />
          </>
        )}
      </svg>
      {preference === 'system' && (
        <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-white/80" aria-hidden />
      )}
    </button>
  )
}
