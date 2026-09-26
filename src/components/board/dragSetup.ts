import { MouseSensor, TouchSensor, pointerWithin, useSensor, useSensors } from '@dnd-kit/core'

/**
 * How the board listens for a drag.
 *
 * Lives apart from the board so the check that drives a real pointer can drive
 * the same configuration: the interesting part of dragging here is not what
 * happens on a drop — that is pure and unit-tested in `src/lib/dnd.ts` — but
 * whether a gesture is read as a drag at all. Those numbers are the feature.
 *
 * A mouse must travel 6px before a press becomes a drag, so clicking the × on
 * a chip still unassigns rather than picking the chip up. A finger must rest
 * for 250ms and stay within 8px, so a flick down the section list scrolls the
 * page as it always did and only a deliberate hold lifts a name off a card.
 * Both are the same principle: the tap has right of way, because tapping is
 * how the coordinator works on a phone and dragging is a shortcut for when
 * they are not.
 */
export function useBoardSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )
}

/**
 * `pointerWithin` rather than the default rectangle intersection: a pill under
 * a fingertip overlaps three cards at once on a phone, and the card the finger
 * is actually on is the only honest answer.
 */
export const boardCollisionDetection = pointerWithin
