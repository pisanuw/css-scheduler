interface ChipOption<T> {
  value: T
  label: string
}

export function ChipGroup<T extends string | number>({
  options,
  selected,
  onChange,
  disabled,
  tone = 'purple',
}: {
  options: ChipOption<T>[]
  selected: T[]
  onChange: (next: T[]) => void
  disabled?: boolean
  tone?: 'purple' | 'rose'
}) {
  const on =
    tone === 'rose'
      ? 'bg-rose-600 text-white border-rose-600'
      : 'text-white border-transparent'
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = selected.includes(o.value)
        return (
          <button
            key={String(o.value)}
            type="button"
            disabled={disabled}
            onClick={() =>
              onChange(active ? selected.filter((v) => v !== o.value) : [...selected, o.value])
            }
            style={active && tone === 'purple' ? { background: 'var(--uw-purple)' } : undefined}
            className={`rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-50 ${
              active ? on : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function TriState({
  value,
  onChange,
  disabled,
  yes = 'Yes',
  no = 'No',
}: {
  value: boolean | null
  onChange: (v: boolean | null) => void
  disabled?: boolean
  yes?: string
  no?: string
}) {
  const opts: { v: boolean | null; label: string }[] = [
    { v: true, label: yes },
    { v: false, label: no },
    { v: null, label: 'No preference' },
  ]
  return (
    <div className="flex gap-2">
      {opts.map((o) => {
        const active = value === o.v
        return (
          <button
            key={String(o.v)}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.v)}
            style={active ? { background: 'var(--uw-purple)' } : undefined}
            className={`rounded-full border px-3 py-1 text-sm disabled:opacity-50 ${
              active ? 'border-transparent text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg bg-white p-5 ring-1 ring-slate-200">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}
