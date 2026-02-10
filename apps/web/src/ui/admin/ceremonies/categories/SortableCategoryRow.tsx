import { ActionIcon, Box, Group, Text } from "@mantine/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const TRASH_ICON = String.fromCharCode(0xe872);

export function SortableCategoryRow(props: {
  id: number;
  iconVariant?: "default" | "inverted";
  iconGlyph: string;
  name: string;
  unitKindLabel: string;
  canEdit: boolean;
  onRemove: () => void;
}) {
  const { id, iconVariant, iconGlyph, name, unitKindLabel, canEdit, onRemove } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !canEdit });

  return (
    <Box
      ref={setNodeRef}
      className={["admin-category-row", isDragging ? "is-dragging" : ""].join(" ")}
      role="listitem"
      style={{
        transform: CSS.Transform.toString(transform),
        transition
      }}
    >
      <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
        <Box
          component="button"
          type="button"
          className="nomination-drag-handle-button"
          {...attributes}
          {...listeners}
          aria-label="Reorder category"
          aria-roledescription="draggable"
          aria-grabbed={isDragging}
          disabled={!canEdit}
        >
          <Text
            component="span"
            className="gicon nomination-drag-handle"
            aria-hidden="true"
          >
            drag_indicator
          </Text>
        </Box>

        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs" wrap="nowrap">
            <Text
              component="span"
              className={["mi-icon", iconVariant === "inverted" ? "mi-icon-inverted" : ""]
                .filter(Boolean)
                .join(" ")}
              aria-hidden="true"
            >
              {iconGlyph}
            </Text>
            <Text fw={700} lineClamp={1} style={{ flex: 1, minWidth: 0 }}>
              {name}
            </Text>
          </Group>
          <Text className="muted" size="sm">
            {unitKindLabel}
          </Text>
        </Box>
      </Group>

      <ActionIcon
        type="button"
        variant="subtle"
        aria-label="Remove category"
        onClick={onRemove}
        disabled={!canEdit}
        className="admin-trash"
      >
        <Text component="span" className="gicon" aria-hidden="true">
          {TRASH_ICON}
        </Text>
      </ActionIcon>
    </Box>
  );
}

