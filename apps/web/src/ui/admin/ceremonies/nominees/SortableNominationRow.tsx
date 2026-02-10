import { ActionIcon, Box, Group, Text, Tooltip } from "@mantine/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

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

  return (
    <Group
      ref={setNodeRef}
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
      style={{
        transform: CSS.Transform.toString(transform),
        transition
      }}
    >
      <Group gap="sm" align="center" wrap="nowrap" style={{ minWidth: 0 }}>
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
        <Box style={{ minWidth: 0 }}>
          <Text className="nomination-title" fw={700} lineClamp={1}>
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
