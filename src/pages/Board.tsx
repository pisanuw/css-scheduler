import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { countBySeverity, detectConflicts, type Severity } from '../lib/conflicts'
import { loadTallies, type SectionRow } from '../lib/snapshot'
import { useScenarioSnapshot } from '../hooks/useScenarioSnapshot'
import {
  useApplySeedPlan,
  useAssign,
  useBulkAssign,
  useDeleteSection,
  useMoveAssignment,
  useSaveSection,
  useScenarioChanges,
  useScenarios,
  useUnassign,
  useUndoChanges,
} from '../hooks/scheduling'
import { myLastUndoableIds, undoneMessage } from '../lib/undo'
import {
  describeDrop,
  dragAnnouncement,
  dropHints,
  parseDragId,
  parseDropId,
  planDrop,
  type DragSource,
} from '../lib/dnd'
import { useAuth } from '../lib/auth'
import { useAcademicYears } from '../hooks/preferences'
import { suggestAssignments } from '../lib/suggest'
import SectionCard from '../components/board/SectionCard'
import DragPill from '../components/board/DragPill'
import { boardCollisionDetection, useBoardSensors } from '../components/board/dragSetup'
import AssignSheet from '../components/board/AssignSheet'
import ConflictPanel from '../components/board/ConflictPanel'
import LoadPanel from '../components/board/LoadPanel'
import QuarterTabs from '../components/board/QuarterTabs'
import HistoryPanel from '../components/board/HistoryPanel'
import SuggestSheet from '../components/board/SuggestSheet'
import ImportSheet from '../components/board/ImportSheet'
import { useToast } from '../components/Toast'
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
    <section className="rounded-lg bg-surface p-6 ring-1 ring-slate-200">
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

  const { scenario, snapshot, board, terms, courses, instructors, timeSlots, rooms, cycleId } =
    useScenarioSnapshot(resolvedId)
  const years = useAcademicYears()

  const changes = useScenarioChanges(resolvedId)
  const saveSection = useSaveSection(resolvedId ?? '')
  const deleteSection = useDeleteSection(resolvedId ?? '')
  const assign = useAssign(resolvedId ?? '')
  const unassign = useUnassign(resolvedId ?? '')
  const bulkAssign = useBulkAssign(resolvedId ?? '')
  const move = useMoveAssignment(resolvedId ?? '')
  const undo = useUndoChanges(resolvedId ?? '')
  const applyImport = useApplySeedPlan()
  const { profile } = useAuth()
  const toast = useToast()

  const [termId, setTermId] = useState<string | null>(null)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [editing, setEditing] = useState<SectionFormValue | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [dragging, setDragging] = useState<DragSource | null>(null)
  const [overSectionId, setOverSectionId] = useState<string | null>(null)

  // Default to the first quarter once the terms arrive.
  useEffect(() => {
    if (!termId && terms.data && terms.data.length > 0) setTermId(terms.data[0]!.id)
  }, [terms.data, termId])

  const locked = scenario.data?.is_locked ?? false

  /**
   * Naming what was reversed matters more here than anywhere else on the board:
   * the change being taken back may be several taps old, and with ⌘Z it is not
   * even the thing the coordinator is looking at.
   */
  const runUndo = useCallback(
    (ids: number[]) => {
      undo.mutate(ids, {
        onSuccess: ({ count, summary }) => toast.ok(undoneMessage(count, summary)),
        onError: (e) => toast.failed('Could not undo that', e),
      })
    },
    [undo.mutate, toast],
  )

  /**
   * ⌘Z / Ctrl+Z takes back my own most recent change. Someone else's later edit
   * is theirs to take back — it keeps its own Undo button in the history panel,
   * where reversing it is deliberate rather than a reflex.
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'z' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
      // Never steal undo from a field being typed into, or from an open sheet.
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (!resolvedId || editing || assigning || suggesting || importing || locked || undo.isPending)
        return
      e.preventDefault()
      // Both halves of a move, so ⌘Z after a drag puts the person back on the
      // section they came from rather than leaving them on neither.
      const ids = myLastUndoableIds(changes.data ?? [], profile?.email)
      if (!ids) {
        toast.say('Nothing of yours left to undo.')
        return
      }
      runUndo(ids)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    resolvedId,
    changes.data,
    profile?.email,
    editing,
    assigning,
    suggesting,
    importing,
    locked,
    undo.isPending,
    runUndo,
    toast,
  ])

  const courseOrder = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of courses.data ?? []) m.set(c.id, c.number)
    return m
  }, [courses.data])

  const conflicts = useMemo(() => detectConflicts(snapshot), [snapshot])
  const counts = useMemo(() => countBySeverity(conflicts), [conflicts])
  const tallies = useMemo(() => loadTallies(snapshot), [snapshot])

  // Only computed while the sheet is open; it walks every unstaffed section
  // against every instructor, and the board does not need it otherwise.
  const suggestions = useMemo(
    () => (suggesting ? suggestAssignments(snapshot) : null),
    [suggesting, snapshot],
  )
  const unstaffedCount = snapshot.sections.filter((s) => s.instructorIds.length === 0).length

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

  /**
   * What the scenario already holds, keyed the way the sections table's unique
   * constraint is. An import into a quarter that is half-built has to know, or
   * one collision would fail the whole insert.
   */
  const existingKeys = useMemo(
    () =>
      new Set(
        (board.data?.sections ?? []).map(
          (s) => `${s.term_id}|${s.course_id}|${s.section_letter.toUpperCase()}`,
        ),
      ),
    [board.data?.sections],
  )

  /**
   * Dragging is an accelerator laid over the taps, never a replacement for
   * them: everything it does is also reachable from the card's Assign button
   * and the × on a chip, which is what a phone and a keyboard use. The sensor
   * tuning that keeps it out of the way lives in `dragSetup`, where the check
   * that drives a real pointer can use the same numbers.
   */
  const sensors = useBoardSensors()

  /**
   * Computed when the drag starts, not as it moves: it ranks the roster once
   * per visible section, which is nothing on a quarter's worth of cards and
   * wasteful at sixty frames a second.
   */
  const hints = useMemo(
    () => (dragging ? dropHints(snapshot, dragging, visible) : null),
    [dragging, snapshot, visible],
  )

  const onDragStart = (e: DragStartEvent) => {
    setDragging(parseDragId(e.active.id))
    setOverSectionId(null)
  }

  const onDragOver = (e: DragOverEvent) => setOverSectionId(parseDropId(e.over?.id ?? null))

  const onDragEnd = (e: DragEndEvent) => {
    const source = parseDragId(e.active.id)
    const targetId = parseDropId(e.over?.id ?? null)
    const hint = targetId ? (hints?.get(targetId) ?? null) : null
    setDragging(null)
    setOverSectionId(null)
    if (!source || locked) return

    const plan = planDrop(snapshot, source, targetId)
    const message = describeDrop(snapshot, plan, hint)
    if (plan.type === 'none') {
      if (message) toast.say(message)
      return
    }
    if (plan.type === 'assign') {
      assign.mutate(
        { sectionId: plan.sectionId, instructorId: plan.instructorId },
        {
          onSuccess: () => message && toast.ok(message),
          onError: (err) => toast.failed('Could not assign', err),
        },
      )
      return
    }
    move.mutate(
      { instructorId: plan.instructorId, from: plan.from, to: plan.to },
      {
        onSuccess: () => message && toast.ok(message),
        onError: (err) => toast.failed('Could not move that assignment', err),
      },
    )
  }

  const cancelDrag = () => {
    setDragging(null)
    setOverSectionId(null)
  }

  /** dnd-kit would otherwise read the raw ids out loud. */
  const announcements = {
    onDragStart: ({ active }: { active: { id: unknown } }) =>
      dragAnnouncement(snapshot, 'start', active.id, null),
    onDragOver: ({ active, over }: { active: { id: unknown }; over: { id: unknown } | null }) =>
      dragAnnouncement(snapshot, 'over', active.id, over?.id ?? null),
    onDragEnd: ({ active, over }: { active: { id: unknown }; over: { id: unknown } | null }) =>
      dragAnnouncement(snapshot, 'end', active.id, over?.id ?? null),
    onDragCancel: ({ active }: { active: { id: unknown } }) =>
      dragAnnouncement(snapshot, 'cancel', active.id, null),
  }

  if (!resolvedId) return <BoardPicker />
  if (scenario.isLoading) return <p className="text-sm text-slate-500">Loading board…</p>
  if (scenario.error || !scenario.data)
    return (
      <p className="rounded-lg bg-surface p-6 text-sm text-red-700 ring-1 ring-slate-200">
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
    const wasNew = !editing.id
    saveSection.mutate(toRow(editing, resolvedId), {
      onSuccess: () => {
        setEditing(null)
        toast.ok(wasNew ? 'Section added.' : 'Section saved.')
      },
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
        toast.ok('Section deleted.')
      },
      onError: (e) => setEditorError((e as Error).message),
    })
  }

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
        <Link
          to="/scenarios"
          className="flex min-h-11 items-center text-sm text-slate-500 underline hover:text-slate-700"
        >
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

      {locked && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This scenario is locked. Unlock it to make changes.
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={boardCollisionDetection}
        accessibility={{ announcements }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={cancelDrag}
      >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-900">
              {termLabel(termId)} — {visible.length} section{visible.length === 1 ? '' : 's'}
            </h2>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setImporting(true)}
                disabled={locked}
                className="flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Import
              </button>
              {unstaffedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setSuggesting(true)}
                  disabled={locked}
                  className="flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Fill {unstaffedCount} gap{unstaffedCount === 1 ? '' : 's'}
                </button>
              )}
              <button
                type="button"
                onClick={openNew}
                disabled={locked}
                style={{ background: 'var(--uw-purple)' }}
                className="flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Add section
              </button>
            </div>
          </div>

          {board.isLoading ? (
            <p className="text-sm text-slate-500">Loading sections…</p>
          ) : visible.length === 0 ? (
            <div className="rounded-lg bg-surface p-6 ring-1 ring-slate-200">
              <p className="text-sm text-slate-600">
                No sections in {termLabel(termId)} yet. Paste the published time schedule to start
                from what is already there, or add the first one by hand and tap it to assign an
                instructor.
              </p>
              <button
                type="button"
                onClick={() => setImporting(true)}
                disabled={locked}
                className="mt-3 flex min-h-11 items-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Import {termLabel(termId)} from a time schedule
              </button>
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
                    dragEnabled={!locked}
                    hint={hints?.get(s.id) ?? null}
                    onAssign={() => setAssigning(s.id)}
                    onUnassign={(instructorId) =>
                      unassign.mutate(
                        { sectionId: s.id, instructorId },
                        { onError: (e) => toast.failed('Could not unassign', e) },
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
          <LoadPanel tallies={tallies} terms={snapshot.terms} draggable={!locked} />
          <HistoryPanel
            changes={changes.data ?? []}
            loading={changes.isLoading}
            canUndo={!locked}
            undoing={undo.isPending}
            onUndo={runUndo}
          />
          {!cycleId && (
            <p className="rounded-lg bg-surface p-3 text-xs text-slate-500 ring-1 ring-slate-200">
              No preference cycle exists for this year, so nothing is checked against what
              instructors asked for. Open one under Cycles.
            </p>
          )}
        </div>
      </div>

        <DragOverlay dropAnimation={null}>
          {dragging && (
            <DragPill
              name={instructorName.get(dragging.instructorId) ?? 'Instructor'}
              hint={overSectionId ? (hints?.get(overSectionId) ?? null) : null}
            />
          )}
        </DragOverlay>
      </DndContext>

      {assigningSection && (
        <AssignSheet
          section={assigningSection}
          snapshot={snapshot}
          termLabel={termLabel(assigningSection.termId)}
          onClose={() => setAssigning(null)}
          onPick={(instructorId) => {
            assign.mutate(
              { sectionId: assigningSection.id, instructorId },
              { onError: (e) => toast.failed('Could not assign', e) },
            )
            setAssigning(null)
          }}
        />
      )}

      {suggesting && suggestions && (
        <SuggestSheet
          result={suggestions}
          termLabel={termLabel}
          applying={bulkAssign.isPending}
          onClose={() => setSuggesting(false)}
          onApply={(picks) =>
            bulkAssign.mutate(picks, {
              onSuccess: (n) => {
                setSuggesting(false)
                toast.ok(`Assigned ${n} section${n === 1 ? '' : 's'}.`)
              },
              onError: (e) => toast.failed('Could not apply the suggestions', e),
            })
          }
        />
      )}

      {importing && termId && (
        <ImportSheet
          termLabel={termLabel(termId)}
          quarter={snapshot.terms.find((t) => t.id === termId)?.quarter ?? 'autumn'}
          courses={courses.data ?? []}
          roster={instructors.data ?? []}
          timeSlots={timeSlots.data ?? []}
          rooms={rooms.data ?? []}
          termId={termId}
          existingKeys={existingKeys}
          academicYear={
            years.data?.find((y) => y.id === scenario.data?.academic_year_id)?.name ?? ''
          }
          applying={applyImport.isPending}
          onClose={() => setImporting(false)}
          onApply={(plan) =>
            applyImport.mutate(
              { scenarioId: resolvedId!, plan },
              {
                onSuccess: ({ sections, assignments }) => {
                  setImporting(false)
                  toast.ok(
                    `Imported ${sections} section${sections === 1 ? '' : 's'} and ${assignments} assignment${
                      assignments === 1 ? '' : 's'
                    } into ${termLabel(termId)}.`,
                  )
                },
                onError: (e) => toast.failed('Could not import that schedule', e),
              },
            )
          }
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
