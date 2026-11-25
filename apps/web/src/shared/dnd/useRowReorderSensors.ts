import { PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";

/** Pointer travel before a press on a row becomes a drag; shorter is a click. */
export const ROW_DRAG_DISTANCE_PX = 6;
/** Touch hold before a row lifts; a shorter tap or a swipe keeps its meaning. */
export const ROW_DRAG_TOUCH_DELAY_MS = 250;
/** Finger travel allowed during the hold before it counts as a swipe. */
export const ROW_DRAG_TOUCH_TOLERANCE_PX = 5;

/**
 * Sensors for a list that drags by the row or its pill rather than a grip:
 * a mouse or pen drag after 6 px, a touch drag after a 250 ms hold. There is
 * no keyboard sensor, because the row's pill keeps Space and Enter for its
 * own action; keyboard reordering is the caller's Alt+Arrow and menu. While
 * the list cannot change (locked or busy), pass `disabled` to `useSortable`.
 * The existing `useReorderSensors` stays for admin lists with a grip.
 */
export function useRowReorderSensors() {
  return useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: ROW_DRAG_DISTANCE_PX }
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: ROW_DRAG_TOUCH_DELAY_MS,
        tolerance: ROW_DRAG_TOUCH_TOLERANCE_PX
      }
    })
  );
}
