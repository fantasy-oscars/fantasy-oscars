import { KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

/**
 * Sensors for a reorderable list: a pointer drag (after `pointerDistance` px, when
 * given) and the keyboard (Space to lift, arrows to move, Space to drop). Both end
 * in the same `onDragEnd`, so a keyboard reorder persists like a mouse drag.
 */
export function useReorderSensors(pointerDistance?: number) {
  return useSensors(
    useSensor(
      PointerSensor,
      pointerDistance === undefined
        ? undefined
        : { activationConstraint: { distance: pointerDistance } }
    ),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
}
