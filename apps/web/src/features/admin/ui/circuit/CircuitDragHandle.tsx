import { useCallback, useMemo, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Box, Text } from "@ui";
import { useSortableInlineStyle } from "@/shared/dnd/useSortableInlineStyle";

/** A sortable node: its ref, its drag handle's props, and whether it is lifted. */
export function useSortableNode(id: string, disabled: boolean) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });
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
  return { setRef, handle: { ...attributes, ...listeners }, isDragging };
}

/**
 * The grip that lifts a row: drag it, or focus it and press Space, the arrow
 * keys and Space again.
 */
export function CircuitDragHandle(props: {
  label: string;
  disabled: boolean;
  handle: ReturnType<typeof useSortableNode>["handle"];
}) {
  return (
    <Box
      component="button"
      type="button"
      className="nomination-drag-handle-button"
      {...props.handle}
      aria-label={props.label}
      aria-roledescription="draggable"
      disabled={props.disabled}
    >
      <Text component="span" className="gicon nomination-drag-handle" aria-hidden="true">
        drag_indicator
      </Text>
    </Box>
  );
}
