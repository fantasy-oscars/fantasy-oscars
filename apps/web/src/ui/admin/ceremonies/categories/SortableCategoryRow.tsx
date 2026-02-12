import { ActionIcon, Box, Group, Text } from "@ui";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useMemo, useRef } from "react";
import { useSortableInlineStyle } from "../../../dnd/useSortableInlineStyle";

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
    <Box
      ref={setRef}
      className={["admin-category-row", isDragging ? "is-dragging" : ""].join(" ")}
      role="listitem"
    >
      <Group gap="sm" wrap="nowrap" className="fo-flex1Minw0">
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

        <Box className="fo-flex1Minw0">
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
            <Text fw="var(--fo-font-weight-bold)" lineClamp={1} className="fo-flex1Minw0">
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
