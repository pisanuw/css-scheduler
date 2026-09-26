import { useAuth } from '../lib/auth'

export default function Login() {
  const { signIn } = useAuth()
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl bg-surface p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--uw-purple-ink)' }}>
          CSS Scheduler
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Instructor assignment for UW Bothell Computing &amp; Software Systems.
        </p>
        <button
          onClick={signIn}
          style={{ background: 'var(--uw-purple)' }}
          className="mt-6 flex min-h-11 w-full items-center justify-center rounded-md px-4 text-sm font-medium text-white hover:opacity-90"
        >
          Sign in with UW Google
        </button>
        <p className="mt-4 text-xs text-slate-500">
          Restricted to uw.edu accounts.
        </p>
      </div>
    </div>
  )
}
