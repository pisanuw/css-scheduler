/** Hands the browser a file without a round trip to a server. */
export function downloadText(filename: string, mime: string, text: string): void {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }))
}

/** The same for bytes: a workbook the page built. */
export function downloadBytes(filename: string, mime: string, bytes: Uint8Array): void {
  // `slice()` gives the bytes an ArrayBuffer of their own, which is what `BlobPart` is typed to take.
  downloadBlob(filename, new Blob([bytes.slice().buffer], { type: mime }))
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoked on the next tick: Safari has not finished reading it synchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** 'First pass' -> 'first-pass', for a filename that survives every OS. */
export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'scenario'
  )
}
