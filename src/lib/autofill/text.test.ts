import { describe, expect, it } from 'vitest'
import {
  availabilityRules,
  breaks,
  courseKeys,
  dayMentions,
  describeRule,
  firstNumber,
  inferMeridiem,
  parseRuleList,
  parseSectionLabel,
  proseTimeRules,
  quarterCounts,
  quarterMentions,
  snapWindow,
  timeMentions,
  type TimeRule,
} from './text'

const h = (hh: number, mm = 0) => hh * 60 + mm

describe('courseKeys', () => {
  it('reads the ways a survey writes a course', () => {
    expect(courseKeys('CSS451, CSS385, CSS SKL 342, the C++ CSS290, CSS452')).toEqual(['451', '385', 'SKL342', '290', '452'])
    expect(courseKeys('CSS-310, CSS-434')).toEqual(['310', '434'])
    expect(courseKeys('CSSSKL 511, CSSSKL 594')).toEqual(['SKL511', 'SKL594'])
    expect(courseKeys('343, 340, 483, 582, 501(designed as online), 497C')).toEqual(['343', '340', '483', '582', '501', '497'])
  })

  it('treats BCUSP and BCORE as one subject, and keeps other subjects apart from CSS', () => {
    expect(courseKeys('BCUSP 115/116, CSS 101')).toEqual(['BCORE115', 'BCORE116', '101'])
    expect(courseKeys('BST205A')).toEqual(['BST205'])
    expect(courseKeys('CSS 101 / BIS 111 (Digital Thinking)')).toEqual(['101', 'BIS111'])
  })

  it('does not read times, percentages, years or rooms as courses', () => {
    expect(courseKeys('502 100% online async, 343')).toEqual(['502', '343'])
    expect(courseKeys('willing to teach 845am if necessary')).toEqual([])
    expect(courseKeys('AY 2026-2027, from 1:15pm-3:15pm')).toEqual([])
    expect(courseKeys('3, prefer UW1-051 as classroom')).toEqual([])
  })

  it('reads the Min-style load note as a list', () => {
    expect(courseKeys('502, 584, 343')).toEqual(['502', '584', '343'])
  })
})

describe('parseSectionLabel', () => {
  it('reads every shape the schedule uses', () => {
    expect(parseSectionLabel('142A')).toEqual({ keys: ['142'], letter: 'A', lab: false })
    expect(parseSectionLabel('SKL142A')).toEqual({ keys: ['SKL142'], letter: 'A', lab: true })
    expect(parseSectionLabel('427 Lab')).toEqual({ keys: ['427'], letter: null, lab: true })
    expect(parseSectionLabel('490C/582A')).toEqual({ keys: ['490', '582'], letter: 'C', lab: false })
    expect(parseSectionLabel('BCORE 115/116')).toEqual({ keys: ['BCORE115', 'BCORE116'], letter: null, lab: false })
    expect(parseSectionLabel('BST 205A')).toEqual({ keys: ['BST205'], letter: 'A', lab: false })
  })

  it('refuses a note that happens to sit in the course column', () => {
    expect(parseSectionLabel("ask EE whether needs to add 132 in win'27")).toBeNull()
    expect(parseSectionLabel('# M/W or T/Th:')).toBeNull()
  })
})

describe('quarterMentions', () => {
  it('knows this year from last year', () => {
    const qs = quarterMentions("Aut'26 and win'26, Win 2027, Spring 2027, Fall 2026", 2026)
    expect(qs.map((q) => [q.quarter, q.inYear])).toEqual([
      ['autumn', true],
      ['winter', false],
      ['winter', true],
      ['spring', true],
      ['autumn', true],
    ])
  })

  it('reads the two-letter forms only where a survey uses them', () => {
    expect(quarterMentions('Fall 2, Wi 2.5, Sp 2.5').map((q) => q.quarter)).toEqual(['autumn', 'winter', 'spring'])
    expect(quarterMentions('Wi: Tu/Th 11am').map((q) => q.quarter)).toEqual(['winter'])
    expect(quarterMentions('a spa day, wi-fi').map((q) => q.quarter)).toEqual([])
  })
})

describe('dayMentions', () => {
  const days = (s: string) => dayMentions(s).map((d) => d.days)
  it('reads pairs, ranges, runs and named days', () => {
    expect(days('M/W or Tue/Thu')).toEqual([
      [1, 3],
      [2, 4],
    ])
    expect(days('Mon -Thu and after 4:30 PM')).toEqual([[1, 2, 3, 4]])
    expect(days('8:30-6:00 MTuWThF')).toEqual([[1, 2, 3, 4, 5]])
    expect(days('Evening Tuesday/Thursday')).toEqual([[2, 4]])
    expect(days('on WEDNESDAY is 3:30')).toEqual([[3]])
    expect(days('CSS 343 - Mon-Wed')).toEqual([[1, 3]])
    expect(days('TTH mornings')).toEqual([[2, 4]])
  })
})

describe('timeMentions', () => {
  const times = (s: string) => timeMentions(s).map((t) => [t.start, t.end])
  it('reads ranges with one meridiem the way people write them', () => {
    expect(times('8-10pm')).toEqual([[h(20), h(22)]])
    expect(times('11-1pm')).toEqual([[h(11), h(13)]])
    expect(times('1:15pm-3:15pm')).toEqual([[h(13, 15), h(15, 15)]])
    expect(times('3 PM to 5 PM')).toEqual([[h(15), h(17)]])
    expect(times('8:30-6:00')).toEqual([[h(8, 30), h(18)]])
    expect(times('Wed 7 - 9 pm')).toEqual([[h(19), h(21)]])
  })

  it('reads single times on the campus clock', () => {
    expect(times('845am')).toEqual([[h(8, 45), null]])
    expect(times('545pm on Tue/Thu')).toEqual([[h(17, 45), null]])
    expect(times('at 1:15')).toEqual([[h(13, 15), null]])
    expect(times('1-2 courses')).toEqual([])
  })

  it('infers the meridiem the schedule leaves off', () => {
    expect(inferMeridiem(8, 45)).toBe(h(8, 45))
    expect(inferMeridiem(8, 0)).toBe(h(20))
    expect(inferMeridiem(11, 0)).toBe(h(11))
    expect(inferMeridiem(1, 15)).toBe(h(13, 15))
    expect(inferMeridiem(5, 45)).toBe(h(17, 45))
  })
})

describe('proseTimeRules', () => {
  const rules = (s: string) => proseTimeRules(s, 2026).rules.map(describeRule)

  it('separates a refusal from a willingness in one sentence', () => {
    expect(rules('Cannot teach 8-10pm course, but willing to teach 845am if necessary')).toEqual([
      'no 8:00 PM-midnight',
      'prefer not 8:45 AM-10:45 AM',
    ])
  })

  it('reads a latest slot as a latest start, and a latest hour as a latest end', () => {
    expect(rules('I cannot teach any evening or late afternoon classes. The latest I can teach is 1:15 slot.')).toEqual([
      'no 5:45 PM-midnight',
      'no 3:30 PM-5:30 PM',
      'no starting after 1:15 PM',
    ])
    expect(
      rules("For the whole academic year, the latest course I can teach on WEDNESDAY is 3:30. For the other days, I'd like 5:30 to be the latest I teach."),
    ).toEqual(['no starting after 3:30 PM on Wed', 'prefer not ending after 5:30 PM'])
  })

  it('grades how firmly it was said', () => {
    expect(rules('The 8-10pm time slots are very difficult for me.')).toEqual(['avoid 8:00 PM-midnight'])
    expect(rules('I strongly prefer not to teach in the 8-10 PM timeslot.')).toEqual(['avoid 8:00 PM-midnight'])
    expect(rules('I prefer to limit the number of 8-10pm courses I teach. I prefer not to teach before 1:15pm.')).toEqual([
      'prefer not 8:00 PM-midnight',
      'prefer not starting before 1:15 PM',
    ])
    expect(rules('I cannot teach later than 11:00 due to other constraints.')).toEqual(['no starting after 11:00 AM'])
  })

  it('does not turn a statement of when they can teach into a refusal', () => {
    expect(rules('I just have to work at like 545pm due to having a full time job.')).toEqual([])
    expect(rules('When I have two classes, I prefer for them to be on the same days.')).toEqual([])
  })
})

describe('availabilityRules', () => {
  const avail = (s: string) => availabilityRules(s, 2026).map(describeRule)

  it('reads availability around a day job', () => {
    expect(avail('Mon -Thu and after 4:30 PM')).toEqual(['only M/T/W/Th 4:30 PM-midnight'])
    expect(avail('MW 8-10pm')).toEqual(['only M/W 8:00 PM-10:00 PM'])
    expect(avail('545pm on Tue/Thu and 545pm on Mon/Wed')).toEqual(['only T/Th 5:45 PM-7:45 PM, M/W 5:45 PM-7:45 PM'])
  })

  it('carries days written in their own sentence to the times before them', () => {
    expect(avail('11am or 1pm. M/W or Tue/Thu. No evening class.')).toEqual([
      'only M/T/W/Th 11:00 AM-1:00 PM, M/T/W/Th 1:00 PM-3:15 PM',
      'no 5:45 PM-midnight',
    ])
  })

  it('splits an answer by quarter', () => {
    expect(avail('Fall: M/W 1:15pm, 3:30pm.  Wi: Tu/Th 11am, 1:15pm')).toEqual([
      'Aut: only M/W 1:15 PM-3:15 PM, M/W 3:30 PM-5:30 PM',
      'Win: only T/Th 11:00 AM-1:00 PM, T/Th 1:15 PM-3:15 PM',
    ])
    expect(avail('Tues/Thurs at 3:30 and 5:45 p.m. for the Autumn and Spring terms.\nTues/Thurs at 5:45 p.m. for the Winter term.')).toEqual([
      'Aut+Spr: only T/Th 3:30 PM-5:30 PM, T/Th 5:45 PM-7:45 PM',
      'Win: only T/Th 5:45 PM-7:45 PM',
    ])
  })

  it('names nothing when the answer is "flexible", and softens a stated preference', () => {
    expect(avail('Flexible')).toEqual([])
    expect(avail("I'm very flexible")).toEqual([])
    expect(avail('I am generally flexible but I generally prefer daytime, between 10am and 4pm.')).toEqual(['prefers 10:00 AM-4:00 PM'])
  })

  it('widens a loosely written window to the class it means', () => {
    expect(snapWindow(h(15), h(17))).toEqual({ start: h(15), end: h(17, 30) })
    const [rule] = availabilityRules('3 PM to 5 PM')
    expect(breaks(rule!, { days: [1, 3], start: h(15, 30), end: h(17, 30) })).toBe(false)
  })
})

describe('breaks', () => {
  const mw = (start: number) => ({ days: [1, 3], start, end: start + 120 })
  it('applies each kind of rule', () => {
    const avoid8: TimeRule = { kind: 'avoid', start: h(20), end: 24 * 60, strength: 'hard' }
    expect(breaks(avoid8, mw(h(20)))).toBe(true)
    expect(breaks(avoid8, mw(h(17, 45)))).toBe(false)
    const latest: TimeRule = { kind: 'startAfter', at: h(13, 15), strength: 'hard' }
    expect(breaks(latest, mw(h(13, 15)))).toBe(false)
    expect(breaks(latest, mw(h(15, 30)))).toBe(true)
    const wednesday: TimeRule = { kind: 'startAfter', at: h(15, 30), days: [3], strength: 'hard' }
    expect(breaks(wednesday, { days: [2, 4], start: h(17, 45), end: h(19, 45) })).toBe(false)
    expect(breaks(wednesday, mw(h(17, 45)))).toBe(true)
    const only: TimeRule = { kind: 'only', windows: [{ start: h(16, 30), end: 24 * 60, days: [1, 2, 3, 4] }], strength: 'hard' }
    expect(breaks(only, mw(h(17, 45)))).toBe(false)
    expect(breaks(only, { days: [5], start: h(17, 45), end: h(19, 45) })).toBe(true)
  })

  it('never binds an online section, or one outside the rule’s quarters', () => {
    const rule: TimeRule = { kind: 'avoid', start: 0, end: 24 * 60, strength: 'hard', quarters: ['winter'] }
    expect(breaks(rule, null, 'winter')).toBe(false)
    expect(breaks(rule, mw(h(11)), 'autumn')).toBe(false)
    expect(breaks(rule, mw(h(11)), 'winter')).toBe(true)
  })
})

describe('describeRule and parseRuleList', () => {
  it('read back what they wrote, for every kind of rule', () => {
    const rules: TimeRule[] = [
      { kind: 'avoid', start: h(20), end: 24 * 60, strength: 'hard' },
      { kind: 'avoid', start: h(8, 45), end: h(10, 45), strength: 'soft' },
      { kind: 'startAfter', at: h(15, 30), days: [3], strength: 'hard' },
      { kind: 'startBefore', at: h(13, 15), strength: 'soft' },
      { kind: 'endAfter', at: h(17, 30), strength: 'strong' },
      { kind: 'only', windows: [{ start: h(17, 45), end: h(19, 45), days: [2, 4] }, { start: h(20), end: h(22) }], strength: 'hard', quarters: ['winter', 'spring'] },
    ]
    const text = rules.map(describeRule).join('; ')
    const back = parseRuleList(text)
    expect(back.unread).toEqual([])
    expect(back.rules.map(describeRule)).toEqual(rules.map(describeRule))
  })

  it('returns what it cannot read instead of dropping it', () => {
    expect(parseRuleList('no 8:00 PM-midnight; mornings would be lovely').unread).toEqual(['mornings would be lovely'])
  })
})

describe('counts', () => {
  const counts = (v: string | number) => {
    const c = quarterCounts(v, 2026)
    return c.flat !== null ? c.flat : [c.perQuarter.autumn, c.perQuarter.winter, c.perQuarter.spring]
  }
  it('reads every way the part-time survey was answered', () => {
    expect(counts(2)).toBe(2)
    expect(counts('One')).toBe(1)
    expect(counts('2 maximum')).toBe(2)
    expect(counts('1-2 depending if CSS340 is offered. ')).toBe(2)
    expect(counts('3, prefer UW1-051 as classroom')).toBe(3)
    expect(counts('Autumn 3 - Winter 3 - Spring 2')).toEqual([3, 3, 2])
    expect(counts('Three courses in Autumn, Two in Winter, and three in Spring.')).toEqual([3, 2, 3])
    expect(counts('For now just 2 in Winter Quarter')).toEqual([0, 2, 0])
    expect(counts('Fall 2, Wi 2.5, Sp 2.5')).toEqual([2, 2.5, 2.5])
    expect(counts('Autumn and Spring 1 or more courses.  Winter and Summer 0.')).toEqual([1, 0, 1])
    expect(counts('1 course in each of the following quarters: Winter, Fall. maybe summer')).toEqual([1, 1, 0])
    expect(counts('2 maximum in winter quarter possibly 1-2 in autumn ')).toEqual([2, 2, 0])
    expect(counts('Autumn 2026: 0 courses for STEM\nWinter 2027: 2-3 courses\nSpring 2027: 2 courses\nSummer 2027: 1.5 courses')).toEqual([0, 3, 2])
  })

  it("ignores a count tied to last year's quarter", () => {
    expect(counts("I am teaching two courses in win'26. Ideally, I would like to teach 1 course each quarter.")).toBe(1)
  })

  it('takes the first count from a load note', () => {
    expect(firstNumber('8 for now (possibly 1 ISS)')).toBe(8)
    expect(firstNumber('3: 502, 584, 343')).toBe(3)
    expect(firstNumber(5)).toBe(5)
    expect(firstNumber('no idea')).toBeNull()
  })
})
