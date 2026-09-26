import { describe, expect, it } from 'vitest'
import { groupForCard, isBlankCell, isWideCell, textOf, type Column } from './cards'

type Row = { id: string }

const col = (key: string, card?: Column<Row>['card']): Column<Row> => ({
  key,
  header: key,
  render: () => key,
  ...(card ? { card } : {}),
})

const keys = <T,>(columns: Column<T>[]) => columns.map((c) => c.key)

describe('groupForCard', () => {
  it('makes the first column the heading and the rest labelled pairs', () => {
    const g = groupForCard([col('code'), col('title'), col('credits')])
    expect(g.title?.key).toBe('code')
    expect(keys(g.meta)).toEqual(['title', 'credits'])
    expect(g.subtitle).toBeNull()
    expect(g.badges).toEqual([])
    expect(g.actions).toEqual([])
  })

  it('honours the slots a page declares', () => {
    const g = groupForCard([
      col('quarter'),
      col('course', 'title'),
      col('instructor', 'subtitle'),
      col('status', 'badge'),
      col('edit', 'action'),
    ])
    expect(g.title?.key).toBe('course')
    expect(g.subtitle?.key).toBe('instructor')
    expect(keys(g.badges)).toEqual(['status'])
    expect(keys(g.actions)).toEqual(['edit'])
    // The unannotated one still shows up, as a pair.
    expect(keys(g.meta)).toEqual(['quarter'])
  })

  it('does not hand the heading to an unannotated column when one claims it', () => {
    const g = groupForCard([col('quarter'), col('course', 'title')])
    expect(g.title?.key).toBe('course')
    expect(keys(g.meta)).toEqual(['quarter'])
  })

  it('keeps the page column order when mixing declared and default slots', () => {
    const g = groupForCard([
      col('a', 'title'),
      col('b'),
      col('c', 'meta'),
      col('d'),
      col('e', 'meta'),
    ])
    expect(keys(g.meta)).toEqual(['b', 'c', 'd', 'e'])
  })

  it('drops hidden columns from the card entirely', () => {
    const g = groupForCard([col('name', 'title'), col('email', 'hidden'), col('role')])
    expect(keys(g.meta)).toEqual(['role'])
  })

  it('demotes a second heading rather than losing it', () => {
    const g = groupForCard([col('one', 'title'), col('two', 'title')])
    expect(g.title?.key).toBe('one')
    expect(keys(g.meta)).toEqual(['two'])
  })

  it('demotes a second subtitle rather than losing it', () => {
    const g = groupForCard([col('one', 'subtitle'), col('two', 'subtitle')])
    expect(g.subtitle?.key).toBe('one')
    expect(keys(g.meta)).toEqual(['two'])
  })

  it('keeps every column somewhere unless it asked to be hidden', () => {
    const columns = [col('a'), col('b', 'badge'), col('c'), col('d', 'action'), col('e', 'subtitle')]
    const g = groupForCard(columns)
    const placed = [g.title, g.subtitle, ...g.badges, ...g.meta, ...g.actions].filter(Boolean)
    expect(keys(placed as Column<Row>[]).sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('copes with no columns at all', () => {
    const g = groupForCard<Row>([])
    expect(g.title).toBeNull()
    expect(g.meta).toEqual([])
  })

  it('copes with a table that is nothing but actions', () => {
    const g = groupForCard([col('edit', 'action')])
    expect(g.title).toBeNull()
    expect(keys(g.actions)).toEqual(['edit'])
  })
})

describe('isBlankCell', () => {
  it('treats the placeholders a table needs as nothing to show', () => {
    expect(isBlankCell('—')).toBe(true)
    expect(isBlankCell('–')).toBe(true)
    expect(isBlankCell('-')).toBe(true)
    expect(isBlankCell('  —  ')).toBe(true)
    expect(isBlankCell('')).toBe(true)
    expect(isBlankCell('   ')).toBe(true)
    expect(isBlankCell(null)).toBe(true)
    expect(isBlankCell(undefined)).toBe(true)
    expect(isBlankCell(false)).toBe(true)
  })

  it('keeps zero, which is an answer', () => {
    expect(isBlankCell(0)).toBe(false)
    expect(isBlankCell('0')).toBe(false)
  })

  it('keeps real values', () => {
    expect(isBlankCell('CSS 143')).toBe(false)
    expect(isBlankCell(7)).toBe(false)
  })

  it('looks through a wrapper element at the placeholder inside it', () => {
    // Pages style their dashes: `<span className="text-slate-500">—</span>`
    // means exactly what a bare '—' means.
    const el = (children: unknown) => ({ type: 'span', props: { children }, key: null } as never)
    expect(isBlankCell(el('—'))).toBe(true)
    expect(isBlankCell(el(el('—')))).toBe(true)
    expect(isBlankCell(el('6'))).toBe(false)
    expect(isBlankCell(el(0))).toBe(false)
    expect(isBlankCell(el(['—', null]))).toBe(true)
  })

  it('keeps an element that draws itself and has nothing inside', () => {
    // An <hr>, an icon, a progress bar: no children is not no content.
    expect(isBlankCell({ type: 'hr', props: {}, key: null } as never)).toBe(false)
  })

  it('looks inside a fragment of parts', () => {
    expect(isBlankCell(['—', null, ''])).toBe(true)
    expect(isBlankCell(['—', 'CSS 143'])).toBe(false)
    expect(isBlankCell([])).toBe(true)
  })
})

describe('textOf', () => {
  const el = (children: unknown) => ({ type: 'span', props: { children }, key: null } as never)

  it('reads plain values', () => {
    expect(textOf('CSS 143')).toBe('CSS 143')
    expect(textOf(5)).toBe('5')
    expect(textOf(null)).toBe('')
    expect(textOf(undefined)).toBe('')
  })

  it('reads through wrappers and joins parts', () => {
    expect(textOf(el('42 min ago'))).toBe('42 min ago')
    expect(textOf(['CSS ', 143])).toBe('CSS 143')
    expect(textOf(el(['−', 2]))).toBe('−2')
  })

  it('gives up on something it cannot read', () => {
    expect(textOf({ type: 'svg', props: {}, key: null } as never)).toBeNull()
    expect(textOf(['ok', { type: 'svg', props: {}, key: null }] as never)).toBeNull()
  })
})

describe('isWideCell', () => {
  it('gives a long value the whole row', () => {
    expect(
      isWideCell('Minimum grade of 2.0 in CSS 142; may not be repeated.'),
    ).toBe(true)
  })

  it('leaves short values sharing a row', () => {
    expect(isWideCell('5')).toBe(false)
    expect(isWideCell('MW 8:45–10:45 AM')).toBe(false)
    expect(isWideCell('')).toBe(false)
  })

  it('does not widen something it cannot measure', () => {
    expect(isWideCell({ type: 'svg', props: {}, key: null } as never)).toBe(false)
  })
})
