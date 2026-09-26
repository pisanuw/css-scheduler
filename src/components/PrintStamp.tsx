import { printedOn } from '../lib/format'

/**
 * A line that exists only on paper: what this page is about, and when it came
 * out of the printer.
 *
 * On screen every one of these facts is already somewhere — the heading, the
 * two dropdowns, the clock in the corner of the machine. On paper none of them
 * are, and a stack of undated printouts of two drafts of the same year is
 * exactly the situation this app exists to stop.
 *
 * The date is taken when the page renders rather than when Print is pressed.
 * The difference is a page left open across midnight, which is not worth a
 * subscription to the clock.
 */
export default function PrintStamp({ subject }: { subject?: string }) {
  return (
    <p data-print-only className="hidden text-xs text-slate-600 print:mb-3 print:block">
      {subject ? `${subject} · ` : ''}
      {printedOn(new Date())}
    </p>
  )
}
