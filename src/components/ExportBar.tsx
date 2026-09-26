import { downloadText } from '../lib/download'
import { useToast } from './Toast'

export interface CsvExport {
  /** What the button says. */
  label: string
  /** The name the file lands under, including `.csv`. */
  filename: string
  /** Built on the click, not on every render: these walk the whole snapshot. */
  build: () => string
}

/**
 * The row of ways to take a page away with you: a file per export, and the
 * printer.
 *
 * Both the report and the comparison had earned one of these, and the report's
 * was about to be copied wholesale into Compare — including the one part worth
 * keeping identical, which is what the app says afterwards. A download on a
 * phone is the least visible thing this app does: the file lands somewhere the
 * browser chose and nothing on the page moves. Naming the file is the whole
 * point of the message.
 */
export default function ExportBar({
  csvs,
  className = '',
}: {
  csvs: CsvExport[]
  className?: string
}) {
  const toast = useToast()

  const save = ({ filename, build }: CsvExport) => {
    try {
      downloadText(filename, 'text/csv', build())
      toast.ok(`Saved ${filename} to your downloads.`)
    } catch (e) {
      toast.failed(`Could not export ${filename}`, e)
    }
  }

  const button =
    'flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 text-sm text-slate-700 hover:bg-slate-50'

  return (
    <div className={`flex flex-wrap gap-2 print:hidden ${className}`}>
      {csvs.map((c) => (
        <button key={c.filename} type="button" onClick={() => save(c)} className={button}>
          {c.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          toast.say('Opening your print dialog — the controls are left off the page.')
          window.print()
        }}
        className={button}
      >
        Print
      </button>
    </div>
  )
}
