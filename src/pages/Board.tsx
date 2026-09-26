import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { countBySeverity, detectConflicts, type Severity } from '../lib/conflicts'
import { buildSnapshot, loadTallies, type SectionRow } from '../lib/snapshot'
import { useCourses, useInstructors, useLoadTargets } from '../hooks/queries'
import { useCycles, useTerms } from '../hooks/preferences'
import {
  useAllSubmissions,
  useAssign,
  useBoardData,
  useDeleteSection,
  useRooms,
  useSaveSection,
  useScenario,
  useScenarios,
  useTeachingHistoryPairs,
  useTimeSlots,
  useUnassign,
} from '../hooks/scheduling'
import SectionCard from '../components/board/SectionCard'
import AssignSheet from '../components/board/AssignSheet'
import ConflictPanel from '../components/board/ConflictPanel'
import LoadPanel from '../components/board/LoadPanel'
import QuarterTabs from '../components/board/QuarterTabs'
import SectionEditor, {
  toFormValue,
  toRow,
  validate,
  type SectionFormValue,
} from '../components/board/SectionEditor'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/** The first letter not already used by that course in that quarter. */
function nextLetter(sections: SectionRow[], courseId: string, termId: string): string {
  const used = new Set(
    sections.filter((s) => s.course_id === courseId && s.term_id === termId).map((s) => s.section_letter),
  )
  return LETTERS.find((l) => !used.has(l)) ?? 'A'
}

function BoardPicker() {
  const scenarios = useScenarios()
  if (scenarios.isLoading) return <p className="text-sm text-slate-500">Loading…</p>
  return (
    <section className="rounded-lg bg-white p-6 ring-1 ring-slate-200">
      <h1 className="text-xl font-semibold text-slate-900">Assignment board</h1>
      <p className="mt-2 text-sm text-slate-600">
        The board works inside a scenario — one named draft of a year&rsquo;s schedule. Create one to
        get started.
      </p>
      <Link
        to="/scenarios"
        style={{ background: 'var(--uw-purple)' }}
        className="mt-4 inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-white hover:opacity-90"
      >
        Go to scenarios
      </Link>
    </section>
  )
}

export default function Board() {
  const { scenarioId: routeId } = useParams()
  const navigate = useNavigate()
  const scenarios = useScenarios()

  // Landing on /board with no id: the official draft for the year if there is
  // one, otherwise whatever was worked on last.
  const resolvedId = useMemo(() => {
    if (routeId) return routeId
    const list = scenarios.data ?? []
    return (list.find((s) => s.status === 'official') ?? list.find((s) => s.status !== 'archived'))?.id
  }, [routeId, scenarios.data])

  const scenario = useScenario(resolvedId)
  const yearId = scenario.data?.academic_year_id

  const terms = useTerms(yearId)
  const courses = useCourses('undergraduate')
  const instructors = useInstructors()
  const loadTargets = useLoadTargets(yearId)
  const timeSlots = useTimeSlots()
  const rooms = useRooms()
  const board = useBoardData(resolvedId)
  const history = useTeachingHistoryPairs()
  const cycles = useCycles()

  // Preferences come from the cycle that collected them for this same year.
  const cycleId = useMemo(
    () => (cycles.data ?? []).find((c) => c.academic_year_id === yearId)?.id,
    [cycles.data, yearId],
  )
  const submissions = useAllSubmissions(cycleId)

  const saveSection = useSaveSection(resolvedId ?? '')
  const deleteSection = useDeleteSection(resolvedId ?? '')
  const assign = useAssign(resolvedId ?? '')
  const unassign = useUnassign(resolvedId ?? '')

  const [termId, setTermId] = useState<string | null>(null)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [editing, setEditing] = useState<SectionFormValue | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // Default to the first quarter once the terms arrive.
  useEffect(() => {
    if (!termId && terms.data && terms.data.length > 0) setTermId(terms.data[0]!.id)
  }, [terms.data, termId])

  const courseOrder = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of courses.data ?? []) m.set(c.id, c.number)
    return m
  }, [courses.data])

  /**
   * The snapshot spans the whole year even though the board shows one quarter:
   * annual targets and new-prep counts are year-wide, so narrowing it would
   * make the conflict panel quietly wrong.
   */
  const snapshot = useMemo(() => {
    const assignedIds = new Set((board.data?.assignments ?? []).map((a) => a.instructor_id))
    return buildSnapshot({
      terms: terms.data ?? [],
      sections: board.data?.sections ?? [],
      assignments: board.data?.assignments ?? [],
      courses: courses.data ?? [],
      timeSlots: timeSlots.data ?? [],
      rooms: rooms.data ?? [],
      // Inactive people stay listed while they still hold an assignment, so a
      // stale row shows up as something to fix rather than vanishing.
      instructors: (instructors.data ?? []).filter((i) => i.is_active || assignedIds.has(i.id)),
      loadTargets: loadTargets.data ?? [],
      submissions: submissions.data ?? [],
      history: history.data ?? [],
    })
  }, [
    terms.data,
    board.data,
    courses.data,
    timeSlots.data,
    rooms.data,
    instructors.data,
    loadTargets.data,
    submissions.data,
    history.data,
  ])

  const conflicts = useMemo(() => detectConflicts(snapshot), [snapshot])
  const counts = useMemo(() => countBySeverity(conflicts), [conflicts])
  const tallies = useMemo(() => loadTallies(snapshot), [snapshot])

  /** sectionId -> its findings, so each card can show its own badge. */
  const bySection = useMemo(() => {
    const m = new Map<string, { worst: Severity; count: number }>()
    const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 }
    for (const c of conflicts) {
      for (const id of c.sectionIds) {
        const prev = m.get(id)
        if (!prev) m.set(id, { worst: c.severity, count: 1 })
        else
          m.set(id, {
            worst: rank[c.severity] < rank[prev.worst] ? c.severity : prev.worst,
            count: prev.count + 1,
          })
      }
    }
    return m
  }, [conflicts])

  const instructorName = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of snapshot.instructors) m.set(i.id, i.name)
    return m
  }, [snapshot.instructors])

  const visible = useMemo(
    () =>
      snapshot.sections
        .filter((s) => s.termId === termId)
        .sort(
          (a, b) =>
            (courseOrder.get(a.courseId) ?? 0) - (courseOrder.get(b.courseId) ?? 0) ||
            a.sectionLetter.localeCompare(b.sectionLetter),
        ),
    [snapshot.sections, termId, courseOrder],
  )

  const assigningSection = useMemo(
    () => snapshot.sections.find((s) => s.id === assigning) ?? null,
    [snapshot.sections, assigning],
  )

  if (!resolvedId) return <BoardPicker />
  if (scenario.isLoading) return <p className="text-sm text-slate-500">Loading board…</p>
  if (scenario.error || !scenario.data)
    return (
      <p className="rounded-lg bg-white p-6 text-sm text-red-700 ring-1 ring-slate-200">
        That scenario could not be loaded. <Link to="/scenarios" className="underline">Back to scenarios</Link>.
      </p>
    )

  const termLabel = (id: string | null) =>
    snapshot.terms.find((t) => t.id === id)?.label ?? 'Quarter'

  /** Reveal a section a conflict refers to, switching quarter if need be. */
  const reveal = (sectionId: string) => {
    const target = snapshot.sections.find((s) => s.id === sectionId)
    if (!target) return
    setTermId(target.termId)
    setHighlighted(sectionId)
    requestAnimationFrame(() => {
      document.getElementById(`section-${sectionId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }

  const openNew = () => {
    setEditorError(null)
    setEditing({
      term_id: termId ?? terms.data?.[0]?.id ?? '',
      course_id: '',
      section_letter: 'A',
      timing: 'grid',
      time_slot_id: null,
      custom_days: [],
      custom_start: '',
      custom_end: '',
      modality: 'in_person',
      room_id: null,
      enrollment_cap: '',
      notes: '',
    })
  }

  const openEdit = (sectionId: string) => {
    const row = board.data?.sections.find((s) => s.id === sectionId)
    if (!row) return
    setEditorError(null)
    setEditing(toFormValue(row))
  }

  const submitSection = () => {
    if (!editing || !resolvedId) return
    const problem = validate(editing)
    if (problem) {
      setEditorError(problem)
      return
    }
    setEditorError(null)
    saveSection.mutate(toRow(editing, resolvedId), {
      onSuccess: () => setEditing(null),
      onError: (e) => {
        const msg = (e as Error).message
        if (/duplicate key|already exists/i.test(msg)) {
          const free = nextLetter(board.data?.sections ?? [], editing.course_id, editing.term_id)
          setEditorError(
            `That course already has a section ${editing.section_letter.toUpperCase()} in ${termLabel(
              editing.term_id,
            )}. Section ${free} is free.`,
          )
        } else {
          setEditorError(msg)
        }
      },
    })
  }

  const removeSection = () => {
    if (!editing?.id) return
    deleteSection.mutate(editing.id, {
      onSuccess: () => {
        setEditing(null)
        setMessage('Section deleted.')
      },
      onError: (e) => setEditorError((e as Error).message),
    })
  }

  const locked = scenario.data.is_locked

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold text-slate-900">{scenario.data.name}</h1>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            scenario.data.status === 'official'
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-slate-100 text-slate-700'
          }`}
        >
          {scenario.data.status}
        </span>
        <Link to="/scenarios" className="text-sm text-slate-500 underline hover:text-slate-700">
          All scenarios
        </Link>
      </div>

      {(scenarios.data ?? []).length > 1 && (
        <label className="mb-4 block text-sm text-slate-600 sm:max-w-sm">
          Scenario
          <select
            value={resolvedId}
            onChange={(e) => navigate(`/board/${e.target.value}`)}
            className="mt-1 block min-h-11 w-full rounded-md border border-slate-300 px-2"
          >
            {(scenarios.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status})
              </option>
            ))}
          </select>
        </label>
      )}

      <QuarterTabs
        terms={snapshot.terms}
        sections={snapshot.sections}
        selected={termId}
        onSelect={setTermId}
      />

      {message && (
        <div
          role="status"
          className="mb-3 flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700"
        >
          <span className="flex-1">{message}</span>
          <button onClick={() => setMessage(null)} className="h-11 w-11 shrink-0 rounded text-slate-500" aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {locked && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This scenario is locked. Unlock it to make changes.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-900">
              {termLabel(termId)} — {visible.length} section{visible.length === 1 ? '' : 's'}
            </h2>
            <button
              type="button"
              onClick={openNew}
              disabled={locked}
              style={{ background: 'var(--uw-purple)' }}
              className="ml-auto flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Add section
            </button>
          </div>

          {board.isLoading ? (
            <p className="text-sm text-slate-500">Loading sections…</p>
          ) : visible.length === 0 ? (
            <div className="rounded-lg bg-white p-6 ring-1 ring-slate-200">
              <p className="text-sm text-slate-600">
                No sections in {termLabel(termId)} yet. Add the first one, then tap it to assign an
                instructor.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {visible.map((s) => {
                const finding = bySection.get(s.id)
                return (
                  <SectionCard
                    key={s.id}
                    section={s}
                    instructorNames={s.instructorIds.map((id) => ({
                      id,
                      name: instructorName.get(id) ?? 'Unknown',
                    }))}
                    worst={finding?.worst ?? null}
                    conflictCount={finding?.count ?? 0}
                    highlighted={highlighted === s.id}
                    onAssign={() => setAssigning(s.id)}
                    onUnassign={(instructorId) =>
                      unassign.mutate(
                        { sectionId: s.id, instructorId },
                        { onError: (e) => setMessage((e as Error).message) },
                      )
                    }
                    onEdit={() => openEdit(s.id)}
                  />
                )
              })}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <ConflictPanel conflicts={conflicts} counts={counts} onPick={reveal} />
          <LoadPanel tallies={tallies} terms={snapshot.terms} />
          {!cycleId && (
            <p className="rounded-lg bg-white p-3 text-xs text-slate-500 ring-1 ring-slate-200">
              No preference cycle exists for this year, so nothing is checked against what
              instructors asked for. Open one under Cycles.
            </p>
          )}
        </div>
      </div>

      {assigningSection && (
        <AssignSheet
          section={assigningSection}
          snapshot={snapshot}
          termLabel={termLabel(assigningSection.termId)}
          onClose={() => setAssigning(null)}
          onPick={(instructorId) => {
            assign.mutate(
              { sectionId: assigningSection.id, instructorId },
              {
                onError: (e) => setMessage((e as Error).message),
              },
            )
            setAssigning(null)
          }}
        />
      )}

      {editing && (
        <SectionEditor
          value={editing}
          courses={courses.data ?? []}
          terms={terms.data ?? []}
          timeSlots={timeSlots.data ?? []}
          rooms={rooms.data ?? []}
          saving={saveSection.isPending}
          deleting={deleteSection.isPending}
          error={editorError}
          onChange={(v) => {
            // Picking a course for a brand-new section moves the letter on to
            // the first one that course does not already use that quarter.
            const changedTarget = v.course_id !== editing.course_id || v.term_id !== editing.term_id
            if (!editing.id && changedTarget && v.course_id) {
              setEditing({ ...v, section_letter: nextLetter(board.data?.sections ?? [], v.course_id, v.term_id) })
            } else {
              setEditing(v)
            }
          }}
          onSave={submitSection}
          onDelete={removeSection}
          onClose={() => {
            setEditing(null)
            setEditorError(null)
          }}
        />
      )}
    </section>
  )
}
