import { Box, Group, Text, Tooltip } from "@ui";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import { DraftCategoryIcon } from "@/features/draft/ui/DraftCategoryIcon";
import { FO_TOOLTIP_OFFSET_LG_PX } from "@/tokens/overlays";
import { NOMINEE_CARD_TOOLTIP_STYLES } from "@/features/draft/ui/nomineeTooltip";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSortableInlineStyle } from "@/shared/dnd/useSortableInlineStyle";

export function SortableNomineeRow(props: {
  id: number;
  icon: string;
  iconVariant: "default" | "inverted";
  label: string;
  tooltip: ReactNode;
  index: number;
  maxIndex: number;
  onJumpToIndex: (nextIndex: number) => void | Promise<void>;
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
      // Keep the dragged card pinned to the pointer, including while the page auto-scrolls.
      transition: isDragging ? undefined : transition
    }),
    [isDragging, transform, transition]
  );
  useSortableInlineStyle(elRef, sortableStyle);
  const [indexInput, setIndexInput] = useState(String(props.index));
  const [indexEditing, setIndexEditing] = useState(false);

  useEffect(() => {
    setIndexInput(String(props.index));
  }, [props.index]);

  const submitIndex = useCallback(() => {
    const parsed = Number(indexInput);
    if (!Number.isFinite(parsed)) {
      setIndexInput(String(props.index));
      return;
    }
    const clamped = Math.min(props.maxIndex, Math.max(1, Math.floor(parsed)));
    setIndexInput(String(clamped));
    if (clamped === props.index) return;
    void props.onJumpToIndex(clamped);
  }, [indexInput, props]);

  return (
    <Tooltip.Floating
      label={props.tooltip}
      offset={FO_TOOLTIP_OFFSET_LG_PX}
      position="right"
      styles={NOMINEE_CARD_TOOLTIP_STYLES}
      disabled={indexEditing}
    >
      <Box ref={setRef}>
        <Tooltip
          events={{ hover: false, focus: true, touch: false }}
          label={props.tooltip}
          offset={FO_TOOLTIP_OFFSET_LG_PX}
          position="right"
          styles={NOMINEE_CARD_TOOLTIP_STYLES}
          disabled={indexEditing}
        >
          <Group
            className={["draft-plan-row", isDragging ? "is-dragging" : ""].join(" ")}
            justify="space-between"
            align="center"
            wrap="nowrap"
            {...attributes}
            {...listeners}
            role="listitem"
            aria-label={`Reorder nominee: ${props.label}`}
          >
            <Group gap="sm" align="center" wrap="nowrap" miw="var(--fo-space-0)">
              <Box className="draft-plan-indexWrap">
                <Text
                  component="span"
                  className="draft-plan-indexValue"
                  aria-hidden="true"
                >
                  {props.index}
                </Text>
                <Box
                  component="input"
                  className="draft-plan-indexInput"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={props.maxIndex}
                  value={indexInput}
                  aria-label={`Move ${props.label} to position`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => {
                    setIndexEditing(true);
                    e.currentTarget.select();
                  }}
                  onChange={(e) => setIndexInput(e.currentTarget.value)}
                  onBlur={() => {
                    submitIndex();
                    setIndexEditing(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitIndex();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setIndexInput(String(props.index));
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                />
              </Box>
              <Box component="span" className="draft-plan-drag" aria-hidden="true">
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
