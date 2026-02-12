import { Box, Group, Text, Tooltip } from "@ui";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import { DraftCategoryIcon } from "@/features/draft/ui/DraftCategoryIcon";
import { FO_TOOLTIP_OFFSET_LG_PX } from "@/tokens/overlays";
import { NOMINEE_CARD_TOOLTIP_STYLES } from "@/features/draft/ui/nomineeTooltip";
import { useCallback, useMemo, useRef } from "react";
import { useSortableInlineStyle } from "@/shared/dnd/useSortableInlineStyle";

export function SortableNomineeRow(props: {
  id: number;
  icon: string;
  iconVariant: "default" | "inverted";
  label: string;
  tooltip: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.id });

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
    <Tooltip.Floating
      label={props.tooltip}
      offset={FO_TOOLTIP_OFFSET_LG_PX}
      position="right"
      styles={NOMINEE_CARD_TOOLTIP_STYLES}
    >
      <Box
        ref={setRef}
      >
        <Tooltip
          events={{ hover: false, focus: true, touch: false }}
          label={props.tooltip}
          offset={FO_TOOLTIP_OFFSET_LG_PX}
          position="right"
          styles={NOMINEE_CARD_TOOLTIP_STYLES}
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
            <Group gap="sm" align="center" wrap="nowrap" miw="var(--fo-space-0)">
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
              <Text size="xs" truncate="end" lineClamp={1}>
                {props.label}
              </Text>
            </Group>
          </Group>
        </Tooltip>
      </Box>
    </Tooltip.Floating>
  );
}
