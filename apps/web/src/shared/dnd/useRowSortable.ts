import { useCallback, useMemo, useRef } from "react";
import type { PointerEvent, TouchEvent } from "react";
import type { Announcements, ScreenReaderInstructions } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSortableInlineStyle } from "./useSortableInlineStyle";

/** After a drag ends, a click this soon after is the drop's, not the user's. */
const CLICK_AFTER_DRAG_MS = 400;

/**
 * A row of a list that drags by the row or its pill (`useRowReorderSensors`):
 * its ref, whether it is lifted, and the two activators to put where a drag
 * may start. A mouse or pen drags through `onPointerDown`; touch only through
 * `onTouchStart`, so a finger needs the hold and a swipe still scrolls. There
 * is deliberately no keyboard activator: the pill keeps Space and Enter.
 */
export function useRowSortable(id: string, disabled: boolean) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled
  });
  const elRef = useRef<HTMLElement | null>(null);
  const setRef = useCallback(
    (node: HTMLElement | null) => {
      elRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef]
  );
  const style = useMemo(
    () => ({ transform: CSS.Translate.toString(transform), transition }),
    [transform, transition]
  );
  useSortableInlineStyle(elRef, style);
  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      listeners?.onPointerDown?.(e);
    },
    [listeners]
  );
  const onTouchStart = useCallback(
    (e: TouchEvent) => listeners?.onTouchStart?.(e),
    [listeners]
  );
  return { setRef, isDragging, onPointerDown, onTouchStart };
}

/**
 * Tracks a list's drag so the click that ends it is swallowed: true while a
 * row is lifted and for a moment after it is dropped.
 */
export function useDragClickGuard() {
  const dragging = useRef(false);
  const endedAt = useRef(0);
  return useMemo(
    () => ({
      start() {
        dragging.current = true;
      },
      end() {
        dragging.current = false;
        endedAt.current = performance.now();
      },
      /** True when a click now belongs to a drag. */
      swallows() {
        return (
          dragging.current || performance.now() - endedAt.current < CLICK_AFTER_DRAG_MS
        );
      }
    }),
    []
  );
}

const silent = () => undefined;

/**
 * dnd-kit's own announcements name rows by their internal ids, and its
 * instructions describe a keyboard drag these lists do not have. The lists
 * announce each move themselves ("Moved … to position 2 of 3.").
 */
export const ROW_DRAG_ACCESSIBILITY: {
  announcements: Announcements;
  screenReaderInstructions: ScreenReaderInstructions;
} = {
  announcements: {
    onDragStart: silent,
    onDragOver: silent,
    onDragEnd: silent,
    onDragCancel: silent
  },
  screenReaderInstructions: { draggable: "" }
};
