import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { XlsxBook, buildXlsx, colLetters, colNumber, escapeXml, parseRef, serialToMinutes } from './xlsx'

describe('cell references', () => {
  it('converts columns both ways', () => {
    expect([1, 26, 27, 35, 47].map(colLetters)).toEqual(['A', 'Z', 'AA', 'AI', 'AU'])
    expect(['A', 'Z', 'AA', 'AI', 'AU'].map(colNumber)).toEqual([1, 26, 27, 35, 47])
    expect(parseRef('AI35')).toEqual({ row: 35, col: 35 })
  })

  it('reads an Excel time as minutes', () => {
    expect(serialToMinutes(75 / 1440)).toBe(75)
    expect(serialToMinutes(0.45833333333333331)).toBe(660)
  })
})

describe('XlsxBook', () => {
  const bytes = buildXlsx([
    { name: 'Data', rows: [['name', 'count', 'ok'], ['F1 & co <x>', 3, true], [null, 0.5, false]] },
    { name: 'Second', rows: [['only']] },
  ])

  it('reads shared strings, numbers and booleans', () => {
    const book = XlsxBook.read(bytes)
    expect(book.sheetNames()).toEqual(['Data', 'Second'])
    const s = book.sheet('Data')
    expect(s.get(2, 1)).toBe('F1 & co <x>')
    expect(s.get(2, 2)).toBe(3)
    expect(s.get(2, 3)).toBe(true)
    expect(s.get(3, 1)).toBeNull()
    expect(s.text(3, 2)).toBe('0.5')
    expect(s.maxRow).toBe(3)
    expect(s.maxCol).toBe(3)
  })

  it('writes a value with a fill and italics, and reads both back', () => {
    const book = XlsxBook.read(bytes)
    book.setCell('Data', 3, 1, 'P9', { fill: 'FFE4DFEC', italic: true })
    book.setCell('Data', 5, 2, 'a new row', {})
    const again = XlsxBook.read(book.write())
    expect(again.sheet('Data').get(3, 1)).toBe('P9')
    expect(again.fillOf('Data', 3, 1)).toBe('FFE4DFEC')
    expect(again.isItalic('Data', 3, 1)).toBe(true)
    expect(again.sheet('Data').get(5, 2)).toBe('a new row')
    // Untouched cells keep their values and have no fill.
    expect(again.sheet('Data').get(2, 1)).toBe('F1 & co <x>')
    expect(again.fillOf('Data', 2, 1)).toBeNull()
  })

  it('keeps cells in column order when one is inserted into a row', () => {
    const book = XlsxBook.read(bytes)
    book.setCell('Data', 2, 5, 'far right')
    book.setCell('Data', 2, 4, 'between')
    const xml = strFromU8(unzipSync(book.write())['xl/worksheets/sheet1.xml']!)
    const row2 = /<row r="2"[^>]*>([\s\S]*?)<\/row>/.exec(xml)![1]!
    expect([...row2.matchAll(/<c r="([A-Z]+)2"/g)].map((m) => m[1])).toEqual(['A', 'B', 'C', 'D', 'E'])
  })

  it('adds and replaces sheets without leaving references behind', () => {
    const book = XlsxBook.read(bytes)
    book.addSheet('Report', [[{ v: 'Header', header: true }], ['line\nwith a break']], { widths: [30], freezeHeader: true, autoFilter: true })
    const once = XlsxBook.read(book.write())
    expect(once.sheetNames()).toEqual(['Data', 'Second', 'Report'])
    expect(once.sheet('Report').get(2, 1)).toBe('line\nwith a break')

    once.removeSheet('Report')
    once.addSheet('Report', [['again']])
    const files = unzipSync(once.write())
    const twice = XlsxBook.read(once.write())
    expect(twice.sheetNames()).toEqual(['Data', 'Second', 'Report'])
    expect(twice.sheet('Report').get(1, 1)).toBe('again')
    const workbook = strFromU8(files['xl/workbook.xml']!)
    expect(workbook.match(/name="Report"/g)).toHaveLength(1)
    const types = strFromU8(files['[Content_Types].xml']!)
    const parts = Object.keys(files).filter((p) => p.startsWith('xl/worksheets/sheet'))
    for (const p of parts) expect(types).toContain(`/${p}`)
    expect(parts).toHaveLength(3)
  })

  it('refuses a sheet name Excel would refuse', () => {
    const book = XlsxBook.read(bytes)
    expect(() => book.addSheet('a/b', [])).toThrow(/valid sheet name/)
    expect(() => book.addSheet('data', [])).toThrow(/already has/)
  })

  it('says so when a file is not a workbook', () => {
    expect(() => XlsxBook.read(new TextEncoder().encode('not a zip'))).toThrow(/could not be opened/)
  })
})

describe('escapeXml', () => {
  it('escapes markup and drops characters XML cannot hold', () => {
    expect(escapeXml('a < b & "c"\u0007')).toBe('a &lt; b &amp; &quot;c&quot;')
  })
})
