import { ActionIcon, Box, Group, Text, Tooltip } from "@ui";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import { useCallback, useMemo, useRef } from "react";
import { useSortableInlineStyle } from "../../../dnd/useSortableInlineStyle";

export function SortableNominationRow(props: {
  id: number;
  primary: ReactNode;
  secondary: ReactNode;
  onRemove: () => void;
  onEdit: () => void;
  removing: boolean;
  isDropTarget: boolean;
}) {
  const { id, primary, secondary, onRemove, onEdit, removing, isDropTarget } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const elRef = useRef<HTMLDivElement | null>(null);
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      elRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef]
  );

  const sortableStyle = useMemo(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition
    }),
    [transform, transition]
  );
  useSortableInlineStyle(elRef, sortableStyle);

  return (
    <Group
      ref={setRef}
      className={[
        "nomination-row",
        "nomination-row-compact",
        isDragging ? "is-dragging" : "",
        isDropTarget ? "is-drop-target" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      role="listitem"
      justify="space-between"
      align="center"
      wrap="nowrap"
    >
      <Group gap="sm" align="center" wrap="nowrap" className="fo-minw0">
        <Box
          component="button"
          type="button"
          className="nomination-drag-handle-button"
          {...attributes}
          {...listeners}
          aria-label="Reorder nomination"
          aria-roledescription="draggable"
          aria-grabbed={isDragging}
        >
          <Text
            component="span"
            className="gicon nomination-drag-handle"
            aria-hidden="true"
          >
            drag_indicator
          </Text>
        </Box>
        <Box className="fo-minw0">
          <Text className="nomination-title" fw="var(--fo-font-weight-bold)" lineClamp={1}>
            {primary}
          </Text>
          {secondary ? (
            <Text className="nomination-subtitle" size="sm" lineClamp={1}>
              {secondary}
            </Text>
          ) : null}
        </Box>
      </Group>

      <Group gap="xs" wrap="nowrap">
        <Tooltip label="Edit nomination" withArrow>
          <ActionIcon
            type="button"
            variant="subtle"
            aria-label="Edit nomination"
            onClick={onEdit}
            disabled={removing}
          >
            <Text component="span" className="gicon" aria-hidden="true">
              edit
            </Text>
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Remove nomination" withArrow>
          <ActionIcon
            type="button"
            variant="subtle"
            aria-label="Remove nomination"
            onClick={onRemove}
            disabled={removing}
            className="nomination-trash"
          >
            <Text component="span" className="gicon" aria-hidden="true">
              {String.fromCharCode(0xe872)}
            </Text>
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
}
