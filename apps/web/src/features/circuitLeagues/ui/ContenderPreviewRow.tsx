import { ActionIcon, Box, Tooltip } from "@ui";
import type { ContenderPickerProps } from "@/features/contenders/ui/ContenderPicker";
import { circuitFreeAgentPreview } from "@/decisions/circuitFreeAgency";
import type {
  CircuitLeagueCategory,
  CircuitSelectionOwner,
  CircuitSelectionSummary
} from "@/lib/types";
import { ContenderPill, ContenderPillCaption } from "./ContenderPill";

/** The season's contender picker, with the chosen contender's owner once it is read. */
export type CircuitSeasonPicker = ContenderPickerProps & {
  owner?: CircuitSelectionOwner;
};

/**
 * The picker's preview row on the season screens: the contender pill (muted,
 * with "Owned by pia", when someone holds it) and the add icon (free agency)
 * or claim icon (waivers), which picks it. The icon replaces the picker's own
 * confirm button, and it is disabled with the owner as its tooltip while the
 * contender is held.
 */
export function withContenderPreview(input: {
  picker: CircuitSeasonPicker;
  categories: readonly CircuitLeagueCategory[];
  viewerUserId: number | null;
  drop: CircuitSelectionSummary | null;
  busy: boolean;
  verb?: "Add" | "Claim";
}): ContenderPickerProps {
  const { picker } = input;
  const preview = circuitFreeAgentPreview({
    category: picker.category,
    film: picker.film,
    person: picker.person,
    categories: input.categories,
    owner: picker.owner,
    viewerUserId: input.viewerUserId,
    drop: input.drop,
    verb: input.verb
  });
  if (!preview) return picker;
  const busy = picker.picking || input.busy;
  return {
    ...picker,
    confirmActions: [],
    previewPill: (
      <Box
        className={["fo-pillScope", "season-row", "circuit-freeAgentPreview"].join(" ")}
      >
        <Box className="circuit-previewPill">
          <ContenderPill
            label={preview.label}
            categoryName={preview.categoryName}
            iconCode={preview.iconCode}
            iconVariant={preview.iconVariant}
            state={preview.owned ? "muted" : "default"}
            stateSuffix={preview.stateSuffix}
          />
          {preview.caption ? (
            <ContenderPillCaption>{preview.caption}</ContenderPillCaption>
          ) : null}
        </Box>
        <Tooltip label={preview.addTooltip}>
          <ActionIcon
            type="button"
            className="circuit-rowIcon"
            aria-label={preview.addLabel}
            aria-disabled={preview.addDisabled || undefined}
            data-disabled={preview.addDisabled || undefined}
            loading={busy}
            onClick={() => {
              if (!preview.addDisabled && !busy) picker.actions.pick();
            }}
          >
            <span className="gicon" aria-hidden="true">
              add_circle
            </span>
          </ActionIcon>
        </Tooltip>
      </Box>
    )
  };
}
