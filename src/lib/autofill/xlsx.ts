/**
 * Just enough of the xlsx format to read the coordinator's workbooks and to
 * hand one back with names written into it.
 *
 * Not a spreadsheet library, on purpose. The workbook this reads is a living
 * document somebody has maintained for years — merged headers, a frozen pane,
 * per-cell fonts, a print area, 109 merged ranges of notes. A library that
 * loads it into its own model and writes a fresh file from that model gives
 * back *its* idea of the workbook, and whatever it did not understand is gone.
 * So the file is edited where it lies: every part is kept byte for byte except
 * the cells that were written, the styles they needed, and the sheets that were
 * added. Opening the result should look exactly like opening the original with
 * some names typed in.
 *
 * The XML here is machine-written and regular, so it is scanned with regular
 * expressions rather than parsed into a DOM. That also means this runs in Node
 * (the tests, the command line) and in the browser alike, with no DOMParser.
 */

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

export type CellValue = string | number | boolean | null

/** 1 → A, 27 → AA. */
export function colLetters(col: number): string {
  let s = ''
  let n = col
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** A → 1, AA → 27. */
export function colNumber(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

/** 'AI35' → { row: 35, col: 35 }. */
export function parseRef(ref: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/i.exec(ref.trim())
  if (!m) throw new Error(`Not a cell reference: ${ref}`)
  return { col: colNumber(m[1]!), row: Number(m[2]) }
}

export function cellRef(row: number, col: number): string {
  return `${colLetters(col)}${row}`
}

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : ''
    }
    return ENTITY[e.toLowerCase()] ?? ''
  })
}

/**
 * Text as XML content. Characters XML 1.0 forbids outright are dropped rather
 * than escaped: a stray control character pasted into a survey answer would
 * otherwise produce a file Excel refuses to open.
 */
export function escapeXml(s: string): string {
  let clean = ''
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    const allowed = c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd) || c >= 0x10000
    if (allowed) clean += ch
  }
  return clean.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The attributes of one start tag, e.g. `<c r="A1" s="3" t="s">`. */
export function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) out[m[1]!] = decodeXml(m[2]!)
  return out
}

/** The text runs of a string item, skipping the phonetic guides Excel keeps beside them. */
function runText(xml: string): string {
  const body = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
  let out = ''
  for (const m of body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += decodeXml(m[1]!)
  return out
}

interface CellInfo {
  value: CellValue
  style: number
}

/** One worksheet, read. Rows and columns are 1-based, as Excel numbers them. */
export class Sheet {
  readonly maxRow: number
  readonly maxCol: number

  constructor(
    readonly name: string,
    private readonly cells: Map<number, Map<number, CellInfo>>,
  ) {
    let maxRow = 0
    let maxCol = 0
    for (const [r, row] of cells) {
      if (row.size > 0) maxRow = Math.max(maxRow, r)
      for (const c of row.keys()) maxCol = Math.max(maxCol, c)
    }
    this.maxRow = maxRow
    this.maxCol = maxCol
  }

  get(row: number, col: number): CellValue {
    return this.cells.get(row)?.get(col)?.value ?? null
  }

  /** The value as trimmed text: numbers as they would print, blanks as ''. */
  text(row: number, col: number): string {
    const v = this.get(row, col)
    if (v === null) return ''
    if (typeof v === 'number') return String(v)
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
    return v.trim()
  }

  style(row: number, col: number): number {
    return this.cells.get(row)?.get(col)?.style ?? 0
  }

  /** Row numbers that hold at least one cell, in order. */
  rowNumbers(): number[] {
    return [...this.cells.keys()].sort((a, b) => a - b)
  }
}

/** A value for a sheet this module writes from scratch. */
export type OutCell =
  | CellValue
  | {
      v: CellValue
      /** Bold header text on a light band. */
      header?: boolean
      /** Wrap long text within the column. */
      wrap?: boolean
      /** An ARGB fill such as 'FFE4DFEC'. */
      fill?: string
      italic?: boolean
      bold?: boolean
    }

export interface NewSheetOptions {
  /** Column widths in characters, left to right. */
  widths?: number[]
  /** Keep the first row on screen while scrolling. */
  freezeHeader?: boolean
  /** Put filter buttons on the first row. */
  autoFilter?: boolean
}

interface StyleWish {
  fill?: string | null
  italic?: boolean
  bold?: boolean
  wrap?: boolean
}

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const WORKSHEET_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet'
const WORKSHEET_CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'

/** The children of `<tag ...>...</tag>` as raw XML strings, split on `child`. */
function blockItems(xml: string, tag: string, child: string): { items: string[]; found: boolean } {
  const m = new RegExp(`<${tag}\\b[^>]*?(?:/>|>([\\s\\S]*?)</${tag}>)`).exec(xml)
  if (!m) return { items: [], found: false }
  const body = m[1] ?? ''
  const items = [...body.matchAll(new RegExp(`<${child}\\b[^>]*?(?:/>|>[\\s\\S]*?</${child}>)`, 'g'))].map((x) => x[0])
  return { items, found: true }
}

function replaceBlock(xml: string, tag: string, items: string[], before: string[]): string {
  const block = `<${tag} count="${items.length}">${items.join('')}</${tag}>`
  const re = new RegExp(`<${tag}\\b[^>]*?(?:/>|>[\\s\\S]*?</${tag}>)`)
  if (re.test(xml)) return xml.replace(re, () => block)
  // Missing: insert before the first sibling that must follow it.
  for (const next of before) {
    const i = xml.indexOf(`<${next}`)
    if (i >= 0) return xml.slice(0, i) + block + xml.slice(i)
  }
  return xml.replace('</styleSheet>', `${block}</styleSheet>`)
}

/** Styles, held as raw XML items so anything this does not understand survives. */
class Styles {
  fonts: string[]
  fills: string[]
  xfs: string[]
  private readonly original: string
  private dirty = false
  private readonly memo = new Map<string, number>()

  constructor(xml: string | null) {
    this.original = xml ?? MINIMAL_STYLES
    this.fonts = blockItems(this.original, 'fonts', 'font').items
    this.fills = blockItems(this.original, 'fills', 'fill').items
    this.xfs = blockItems(this.original, 'cellXfs', 'xf').items
    if (this.fonts.length === 0) this.fonts = ['<font><sz val="11"/><name val="Calibri"/></font>']
    if (this.fills.length < 2)
      this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>']
    if (this.xfs.length === 0) this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']
    this.dirty = xml === null
  }

  private xf(index: number): string {
    return this.xfs[index] ?? this.xfs[0]!
  }

  private attr(index: number, name: string): number {
    const v = attrs(/<xf\b[^>]*>/.exec(this.xf(index))?.[0] ?? '')[name]
    return v ? Number(v) : 0
  }

  /** The solid fill colour of a cell style, as ARGB, or null. */
  fillRgb(index: number): string | null {
    const fill = this.fills[this.attr(index, 'fillId')] ?? ''
    if (!/patternType="solid"/.test(fill)) return null
    return /<fgColor\b[^>]*\brgb="([0-9A-Fa-f]{8})"/.exec(fill)?.[1]?.toUpperCase() ?? null
  }

  italic(index: number): boolean {
    return /<i\s*\/>|<i\s+val="(?:1|true)"\s*\/>/.test(this.fonts[this.attr(index, 'fontId')] ?? '')
  }

  /**
   * A style that is `base` with the wishes applied — the same font, border,
   * number format and alignment, with a fill, italics or wrapping changed.
   * Memoised, so a hundred names written into cells of one style add one style.
   */
  derive(base: number, wish: StyleWish): number {
    const key = `${base}|${wish.fill ?? '-'}|${wish.italic ?? '-'}|${wish.bold ?? '-'}|${wish.wrap ?? '-'}`
    const hit = this.memo.get(key)
    if (hit !== undefined) return hit

    let xf = this.xf(base)
    const setAttr = (name: string, value: string) => {
      xf = xf.replace(/<xf\b[^>]*?(\/?)>/, (tag, slash: string) => {
        const without = tag.replace(new RegExp(`\\s${name}="[^"]*"`), '').replace(/\s*\/?>$/, '')
        return `${without} ${name}="${value}"${slash ? '/' : ''}>`
      })
    }

    if (wish.fill !== undefined) {
      const fillId = wish.fill === null ? 0 : this.addFill(wish.fill)
      setAttr('fillId', String(fillId))
      setAttr('applyFill', '1')
    }
    if (wish.italic !== undefined || wish.bold !== undefined) {
      let font = this.fonts[this.attr(base, 'fontId')] ?? this.fonts[0]!
      if (wish.italic !== undefined) {
        font = font.replace(/<i\b[^>]*\/>/g, '')
        if (wish.italic) font = font.replace(/<font\b[^>]*>/, (t) => `${t}<i/>`)
      }
      if (wish.bold !== undefined) {
        font = font.replace(/<b\b[^>]*\/>/g, '')
        if (wish.bold) font = font.replace(/<font\b[^>]*>/, (t) => `${t}<b/>`)
      }
      setAttr('fontId', String(this.addFont(font)))
      setAttr('applyFont', '1')
    }
    if (wish.wrap !== undefined) {
      setAttr('applyAlignment', '1')
      if (/<alignment\b/.test(xf)) {
        xf = xf.replace(/<alignment\b([^>]*?)\/>/, (_t, a: string) => {
          const rest = a.replace(/\swrapText="[^"]*"/, '').replace(/\svertical="[^"]*"/, '')
          return `<alignment${rest} vertical="top"${wish.wrap ? ' wrapText="1"' : ''}/>`
        })
      } else {
        // First among an xf's children: the schema orders alignment before protection.
        const align = `<alignment vertical="top"${wish.wrap ? ' wrapText="1"' : ''}/>`
        xf = xf.endsWith('/>') ? xf.replace(/\/>$/, `>${align}</xf>`) : xf.replace(/^<xf\b[^>]*>/, (t) => `${t}${align}`)
      }
    }

    const existing = this.xfs.indexOf(xf)
    const index = existing >= 0 ? existing : this.xfs.push(xf) - 1
    if (existing < 0) this.dirty = true
    this.memo.set(key, index)
    return index
  }

  private addFill(rgb: string): number {
    const xml = `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`
    const i = this.fills.indexOf(xml)
    if (i >= 0) return i
    this.dirty = true
    return this.fills.push(xml) - 1
  }

  private addFont(xml: string): number {
    const i = this.fonts.indexOf(xml)
    if (i >= 0) return i
    this.dirty = true
    return this.fonts.push(xml) - 1
  }

  toXml(): string | null {
    if (!this.dirty) return null
    let xml = this.original
    xml = replaceBlock(xml, 'fonts', this.fonts, ['fills', 'borders', 'cellStyleXfs', 'cellXfs'])
    xml = replaceBlock(xml, 'fills', this.fills, ['borders', 'cellStyleXfs', 'cellXfs'])
    xml = replaceBlock(xml, 'cellXfs', this.xfs, ['cellStyles', 'dxfs', 'tableStyles', 'colors', 'extLst'])
    return xml
  }
}

const MINIMAL_STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<styleSheet xmlns="${MAIN_NS}">` +
  `<fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`

interface SheetEntry {
  name: string
  path: string
  rId: string
  sheetId: number
}

interface PendingCell {
  value: CellValue
  style: number
}

/** A workbook: readable, and editable in place. */
export class XlsxBook {
  private readonly files: Record<string, Uint8Array>
  private sheetsList: SheetEntry[]
  private readonly shared: string[]
  private readonly styles: Styles
  private readonly read = new Map<string, Sheet>()
  private readonly edits = new Map<string, Map<number, Map<number, PendingCell>>>()
  private readonly added = new Map<string, string>()
  private readonly removed = new Set<string>()
  private workbookXml: string
  private relsXml: string
  private contentTypes: string

  private constructor(files: Record<string, Uint8Array>) {
    this.files = files
    const text = (p: string) => (files[p] ? strFromU8(files[p]) : null)
    const workbook = text('xl/workbook.xml')
    if (!workbook) throw new Error('This is not an Excel workbook (.xlsx): it has no xl/workbook.xml.')
    this.workbookXml = workbook
    this.relsXml = text('xl/_rels/workbook.xml.rels') ?? `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`
    this.contentTypes = text('[Content_Types].xml') ?? ''

    const targets = new Map<string, string>()
    for (const m of this.relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
      const a = attrs(m[0])
      if (a.Id && a.Target) targets.set(a.Id, a.Target)
    }
    this.sheetsList = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => {
      const a = attrs(m[0])
      const rId = a['r:id'] ?? a.id ?? ''
      const target = targets.get(rId) ?? ''
      const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
      return { name: a.name ?? '', path, rId, sheetId: Number(a.sheetId ?? 0) }
    })

    const sst = text('xl/sharedStrings.xml')
    this.shared = sst
      ? [...sst.matchAll(/<si\b[^>]*\/>|<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => runText(m[1] ?? ''))
      : []
    this.styles = new Styles(text('xl/styles.xml'))
  }

  static read(bytes: Uint8Array | ArrayBuffer): XlsxBook {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    let files: Record<string, Uint8Array>
    try {
      files = unzipSync(u8)
    } catch {
      throw new Error('This file could not be opened as an Excel workbook. Save it as .xlsx and try again.')
    }
    return new XlsxBook(files)
  }

  sheetNames(): string[] {
    return this.sheetsList.filter((s) => !this.removed.has(s.name)).map((s) => s.name)
  }

  hasSheet(name: string): boolean {
    return this.sheetNames().includes(name)
  }

  sheet(name: string): Sheet {
    const cached = this.read.get(name)
    if (cached) return cached
    const entry = this.sheetsList.find((s) => s.name === name)
    if (!entry) throw new Error(`The workbook has no sheet called “${name}”.`)
    const bytes = this.files[entry.path]
    if (!bytes) throw new Error(`The sheet “${name}” is missing from the workbook.`)
    const sheet = new Sheet(name, this.parseCells(strFromU8(bytes)))
    this.read.set(name, sheet)
    return sheet
  }

  /** The solid fill of a cell, as ARGB ('FFE4DFEC'), or null for none. */
  fillOf(sheetName: string, row: number, col: number): string | null {
    return this.styles.fillRgb(this.sheet(sheetName).style(row, col))
  }

  isItalic(sheetName: string, row: number, col: number): boolean {
    return this.styles.italic(this.sheet(sheetName).style(row, col))
  }

  private parseCells(xml: string): Map<number, Map<number, CellInfo>> {
    const rows = new Map<number, Map<number, CellInfo>>()
    const data = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(xml)?.[1] ?? ''
    let fallbackRow = 0
    for (const rowMatch of data.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rowAttrs = attrs(`<row ${rowMatch[1] ?? ''}>`)
      const r = rowAttrs.r ? Number(rowAttrs.r) : fallbackRow + 1
      fallbackRow = r
      const cells = new Map<number, CellInfo>()
      let fallbackCol = 0
      for (const c of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const a = attrs(`<c ${c[1] ?? ''}>`)
        const col = a.r ? parseRef(a.r).col : fallbackCol + 1
        fallbackCol = col
        const inner = c[2] ?? ''
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
        let value: CellValue
        switch (a.t) {
          case 's':
            value = v === undefined ? null : (this.shared[Number(v)] ?? null)
            break
          case 'inlineStr':
            value = runText(/<is>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? '')
            break
          case 'str':
          case 'e':
          case 'd':
            value = v === undefined ? null : decodeXml(v)
            break
          case 'b':
            value = v === undefined ? null : v.trim() === '1'
            break
          default:
            value = v === undefined || v.trim() === '' ? null : Number(v)
            if (typeof value === 'number' && Number.isNaN(value)) value = null
        }
        cells.set(col, { value, style: a.s ? Number(a.s) : 0 })
      }
      rows.set(r, cells)
    }
    return rows
  }

  /**
   * Write a value into an existing sheet, keeping the cell's own style and
   * changing only what is asked: the fill, and whether the font is italic.
   * `fill: null` clears a fill.
   */
  setCell(
    sheetName: string,
    row: number,
    col: number,
    value: CellValue,
    wish: { fill?: string | null; italic?: boolean } = {},
  ): void {
    const sheet = this.sheet(sheetName)
    const style = this.styles.derive(sheet.style(row, col), wish)
    let rows = this.edits.get(sheetName)
    if (!rows) this.edits.set(sheetName, (rows = new Map<number, Map<number, PendingCell>>()))
    let cols = rows.get(row)
    if (!cols) rows.set(row, (cols = new Map<number, PendingCell>()))
    cols.set(col, { value, style })
  }

  /** Drop a sheet this module added on an earlier run. */
  removeSheet(name: string): void {
    if (this.added.delete(name)) return
    if (this.sheetsList.some((s) => s.name === name)) this.removed.add(name)
  }

  /**
   * Append a sheet written from scratch. Names are Excel's: at most 31
   * characters, none of `[]:*?/\`, and unique ignoring case.
   */
  addSheet(name: string, rows: OutCell[][], opts: NewSheetOptions = {}): void {
    if (name.length > 31 || /[[\]:*?/\\]/.test(name)) throw new Error(`Not a valid sheet name: ${name}`)
    const taken = [...this.sheetNames(), ...this.added.keys()].some((n) => n.toLowerCase() === name.toLowerCase())
    if (taken) throw new Error(`The workbook already has a sheet called “${name}”.`)

    const cols = Math.max(1, ...rows.map((r) => r.length))
    const styleFor = (cell: OutCell): { value: CellValue; style: number } => {
      if (cell === null || typeof cell !== 'object') return { value: cell, style: this.styles.derive(0, { wrap: false }) }
      const wish: StyleWish = { wrap: cell.wrap ?? false }
      if (cell.header) {
        wish.bold = true
        wish.fill = 'FFEDEDED'
      }
      if (cell.fill) wish.fill = cell.fill
      if (cell.italic !== undefined) wish.italic = cell.italic
      if (cell.bold !== undefined) wish.bold = cell.bold
      return { value: cell.v, style: this.styles.derive(0, wish) }
    }

    const body = rows
      .map((cells, i) => {
        const r = i + 1
        const xml = cells
          .map((cell, j) => {
            const { value, style } = styleFor(cell)
            return cellXml(cellRef(r, j + 1), value, style)
          })
          .join('')
        return `<row r="${r}">${xml}</row>`
      })
      .join('')

    const last = cellRef(Math.max(1, rows.length), cols)
    const views = opts.freezeHeader
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>`
      : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`
    const widths = opts.widths?.length
      ? `<cols>${opts.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
      : ''
    const filter = opts.autoFilter && rows.length > 1 ? `<autoFilter ref="A1:${last}"/>` : ''
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
      `<dimension ref="A1:${last}"/>${views}<sheetFormatPr defaultRowHeight="15"/>${widths}` +
      `<sheetData>${body}</sheetData>${filter}` +
      `<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>` +
      `</worksheet>`
    this.added.set(name, xml)
  }

  /** The workbook as bytes, with every edit applied. */
  write(): Uint8Array {
    const out: Record<string, Uint8Array> = { ...this.files }

    for (const [name, rows] of this.edits) {
      const entry = this.sheetsList.find((s) => s.name === name)
      const bytes = entry ? this.files[entry.path] : undefined
      if (!entry || !bytes || this.removed.has(name)) continue
      out[entry.path] = strToU8(applyEdits(strFromU8(bytes), rows))
    }

    let workbook = this.workbookXml
    let rels = this.relsXml
    let types = this.contentTypes
    const structural = this.added.size > 0 || this.removed.size > 0

    // Removing a sheet shifts every later sheet's position, and positions are
    // what defined names and the active tab refer to.
    const gone = this.sheetsList.map((s, i) => (this.removed.has(s.name) ? i : -1)).filter((i) => i >= 0)
    const shift = (k: number) => k - gone.filter((g) => g < k).length
    for (const i of gone) {
      const entry = this.sheetsList[i]!
      delete out[entry.path]
      delete out[entry.path.replace(/([^/]+)$/, '_rels/$1.rels')]
      workbook = workbook.replace(new RegExp(`<sheet\\b[^>]*\\bname="${escapeRe(escapeXml(entry.name))}"[^>]*/>`), '')
      rels = rels.replace(new RegExp(`<Relationship\\b[^>]*\\bId="${escapeRe(entry.rId)}"[^>]*/>`), '')
      types = types.replace(new RegExp(`<Override\\b[^>]*PartName="/${escapeRe(entry.path)}"[^>]*/>`), '')
    }
    if (gone.length) {
      workbook = workbook.replace(
        /<definedName\b([^>]*?)localSheetId="(\d+)"([^>]*)>([\s\S]*?)<\/definedName>/g,
        (_all, pre: string, id: string, post: string, body: string) =>
          gone.includes(Number(id)) ? '' : `<definedName${pre}localSheetId="${shift(Number(id))}"${post}>${body}</definedName>`,
      )
      workbook = workbook.replace(/\bactiveTab="(\d+)"/, (_m, id: string) =>
        gone.includes(Number(id)) ? 'activeTab="0"' : `activeTab="${shift(Number(id))}"`,
      )
      workbook = workbook.replace(/<definedNames>\s*<\/definedNames>/, '')
    }

    const usedIds = new Set([...rels.matchAll(/\bId="([^"]+)"/g)].map((m) => m[1]!))
    const nextRid = () => {
      let n = 1
      while (usedIds.has(`rId${n}`)) n++
      usedIds.add(`rId${n}`)
      return `rId${n}`
    }
    let nextSheetId = Math.max(0, ...this.sheetsList.map((s) => s.sheetId)) + 1
    let fileNo = 1
    for (const [name, xml] of this.added) {
      while (out[`xl/worksheets/sheet${fileNo}.xml`]) fileNo++
      const path = `xl/worksheets/sheet${fileNo}.xml`
      out[path] = strToU8(xml)
      const rId = nextRid()
      rels = rels.replace(
        '</Relationships>',
        `<Relationship Id="${rId}" Type="${WORKSHEET_TYPE}" Target="worksheets/sheet${fileNo}.xml"/></Relationships>`,
      )
      const sheetTag = `<sheet name="${escapeXml(name)}" sheetId="${nextSheetId++}" r:id="${rId}"/>`
      workbook = /<sheets\s*\/>/.test(workbook)
        ? workbook.replace(/<sheets\s*\/>/, `<sheets>${sheetTag}</sheets>`)
        : workbook.replace('</sheets>', `${sheetTag}</sheets>`)
      types = types.replace('</Types>', `<Override PartName="/${path}" ContentType="${WORKSHEET_CT}"/></Types>`)
    }
    if (this.added.size) {
      const root = /<workbook\b[^>]*>/.exec(workbook)?.[0] ?? ''
      if (!/\sxmlns:r=/.test(root)) workbook = workbook.replace('<workbook', `<workbook xmlns:r="${REL_NS}"`)
    }

    const styles = this.styles.toXml()
    if (styles !== null) {
      out['xl/styles.xml'] = strToU8(styles)
      if (!this.files['xl/styles.xml']) {
        rels = rels.replace(
          '</Relationships>',
          `<Relationship Id="${nextRid()}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
        )
        types = types.replace(
          '</Types>',
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
        )
      }
    }

    if (structural || !this.files['xl/styles.xml']) {
      out['xl/workbook.xml'] = strToU8(workbook)
      out['xl/_rels/workbook.xml.rels'] = strToU8(rels)
      out['[Content_Types].xml'] = strToU8(types)
    }
    if (structural && out['docProps/app.xml']) {
      // Excel's cached list of sheet names is advisory; dropping it beats leaving it wrong.
      out['docProps/app.xml'] = strToU8(
        strFromU8(out['docProps/app.xml'])
          .replace(/<HeadingPairs>[\s\S]*?<\/HeadingPairs>/, '')
          .replace(/<TitlesOfParts>[\s\S]*?<\/TitlesOfParts>/, ''),
      )
    }

    return zipSync(out, { level: 6 })
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function cellXml(ref: string, value: CellValue, style: number): string {
  const s = style ? ` s="${style}"` : ''
  if (value === null || value === '') return `<c r="${ref}"${s}/>`
  if (typeof value === 'number') return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : `<c r="${ref}"${s}/>`
  if (typeof value === 'boolean') return `<c r="${ref}"${s} t="b"><v>${value ? 1 : 0}</v></c>`
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}

/**
 * Apply cell edits to one worksheet's XML. Only the rows that change are
 * rebuilt, and within them only the cells that change; a row that did not
 * exist is inserted in order, because Excel refuses a sheet whose rows or
 * cells are out of order.
 */
function applyEdits(xml: string, edits: Map<number, Map<number, PendingCell>>): string {
  const open = /<sheetData\b[^>]*?(\/>|>)/.exec(xml)
  if (!open) return xml
  const selfClosing = open[1] === '/>'
  const start = open.index + open[0].length
  const end = selfClosing ? start : xml.indexOf('</sheetData>', start)
  const data = xml.slice(start, end)

  const rows: { r: number; xml: string }[] = []
  for (const m of data.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(attrs(`<row ${m[1] ?? ''}>`).r)
    const cellsXml = m[2]
    const edit = edits.get(r)
    if (!edit) {
      rows.push({ r, xml: m[0] })
      continue
    }
    const cells = new Map<number, string>()
    for (const c of (cellsXml ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g)) {
      const ref = attrs(`<c ${c[1] ?? ''}>`).r
      if (ref) cells.set(parseRef(ref).col, c[0])
    }
    for (const [col, cell] of edit) cells.set(col, cellXml(cellRef(r, col), cell.value, cell.style))
    const rowAttrs = (m[1] ?? '').replace(/\sspans="[^"]*"/, '')
    const body = [...cells.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]).join('')
    rows.push({ r, xml: `<row${rowAttrs}>${body}</row>` })
  }
  const present = new Set(rows.map((x) => x.r))
  for (const [r, edit] of edits) {
    if (present.has(r)) continue
    const body = [...edit.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([col, cell]) => cellXml(cellRef(r, col), cell.value, cell.style))
      .join('')
    rows.push({ r, xml: `<row r="${r}">${body}</row>` })
  }
  rows.sort((a, b) => a.r - b.r)
  const rebuilt = rows.map((x) => x.xml).join('')
  if (selfClosing) return xml.slice(0, open.index) + `<sheetData>${rebuilt}</sheetData>` + xml.slice(start)
  return xml.slice(0, start) + rebuilt + xml.slice(end)
}

/**
 * A workbook from nothing: the fixtures the tests read, and nothing else.
 * Strings go through the shared string table, as Excel writes them, so the
 * reader's main path is the one exercised.
 */
export function buildXlsx(sheets: { name: string; rows: CellValue[][] }[]): Uint8Array {
  const shared: string[] = []
  const index = new Map<string, number>()
  const sid = (s: string) => {
    let i = index.get(s)
    if (i === undefined) {
      i = shared.push(s) - 1
      index.set(s, i)
    }
    return i
  }
  const files: Record<string, Uint8Array> = {}
  sheets.forEach((sheet, n) => {
    const rows = sheet.rows
      .map((cells, i) => {
        const r = i + 1
        const xml = cells
          .map((v, j) => {
            const ref = cellRef(r, j + 1)
            if (v === null || v === '') return ''
            if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`
            if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`
            return `<c r="${ref}" t="s"><v>${sid(v)}</v></c>`
          })
          .join('')
        return `<row r="${r}">${xml}</row>`
      })
      .join('')
    files[`xl/worksheets/sheet${n + 1}.xml`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheetData>${rows}</sheetData></worksheet>`,
    )
  })
  files['xl/sharedStrings.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="${MAIN_NS}" count="${shared.length}" uniqueCount="${shared.length}">${shared
      .map((s) => `<si><t xml:space="preserve">${escapeXml(s)}</t></si>`)
      .join('')}</sst>`,
  )
  files['xl/styles.xml'] = strToU8(MINIMAL_STYLES)
  files['xl/workbook.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheets>${sheets
      .map((s, n) => `<sheet name="${escapeXml(s.name)}" sheetId="${n + 1}" r:id="rId${n + 1}"/>`)
      .join('')}</sheets></workbook>`,
  )
  const k = sheets.length
  files['xl/_rels/workbook.xml.rels'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map((_, n) => `<Relationship Id="rId${n + 1}" Type="${WORKSHEET_TYPE}" Target="worksheets/sheet${n + 1}.xml"/>`)
      .join('')}<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId${k + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  )
  files['_rels/.rels'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  )
  files['[Content_Types].xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
      .map((_, n) => `<Override PartName="/xl/worksheets/sheet${n + 1}.xml" ContentType="${WORKSHEET_CT}"/>`)
      .join('')}<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
  )
  return zipSync(files, { level: 6 })
}

/** An Excel serial time (a fraction of a day) as minutes past midnight. */
export function serialToMinutes(v: number): number {
  const frac = v - Math.floor(v)
  return Math.round(frac * 1440) % 1440
}
