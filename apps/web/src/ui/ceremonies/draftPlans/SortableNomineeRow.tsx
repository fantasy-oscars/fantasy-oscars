import { Box, Group, Text, Tooltip } from "@mantine/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import { DraftCategoryIcon } from "../../draft/DraftCategoryIcon";

export function SortableNomineeRow(props: {
  id: number;
  icon: string;
  iconVariant: "default" | "inverted";
  label: string;
  tooltip: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.id });

  return (
    <Tooltip.Floating
      label={props.tooltip}
      offset={14}
      position="right"
      styles={{
        tooltip: {
          padding: 0,
          background: "transparent",
          border: "none",
          boxShadow: "none"
        }
      }}
    >
      <Box
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition
        }}
      >
        <Tooltip
          events={{ hover: false, focus: true, touch: false }}
          label={props.tooltip}
          offset={14}
          position="right"
          styles={{
            tooltip: {
              padding: 0,
              background: "transparent",
              border: "none",
              boxShadow: "none"
            }
          }}
        >
          <Group
            className={["draft-plan-row", isDragging ? "is-dragging" : ""].join(" ")}
            justify="space-between"
            align="center"
            wrap="nowrap"
            tabIndex={0}
            role="listitem"
            aria-label={props.label}
          >
            <Group gap="sm" align="center" wrap="nowrap" style={{ minWidth: 0 }}>
              <Box
                component="button"
                type="button"
                className="draft-plan-drag"
                {...attributes}
                {...listeners}
                aria-label="Reorder nominee"
                aria-roledescription="draggable"
                aria-grabbed={isDragging}
              >
                <Text component="span" className="gicon" aria-hidden="true">
                  drag_indicator
                </Text>
              </Box>
              <DraftCategoryIcon icon={props.icon} variant={props.iconVariant} />
              <Text size="xs" style={{ whiteSpace: "nowrap", overflow: "hidden" }} lineClamp={1}>
                {props.label}
              </Text>
            </Group>
          </Group>
        </Tooltip>
      </Box>
    </Tooltip.Floating>
  );
}

