import { Box, Button, Text, Tooltip, UnstyledButton, VisuallyHidden } from "@ui";
import type { RefObject } from "react";
import { NomineeTooltipCard } from "@/features/draft/components/NomineeTooltipCard";
import { DraftCategoryIcon } from "./DraftCategoryIcon";
import {
  NOMINEE_CARD_TOOLTIP_STYLES,
  NOMINEE_TOOLTIP_EVENTS,
  NOMINEE_TOOLTIP_OFFSET_PX
} from "./nomineeTooltip";

export function CategoryCard(props: {
  categoryId: string;
  title: string;
  icon: string;
  iconVariant: "default" | "inverted";
  unitKind: string;
  tooltipsEnabled?: boolean;
  weightText: string | null;
  nominees: Array<{
    id: string;
    label: string;
    muted: boolean;
    selected: boolean;
    winner: boolean;
    posterUrl: string | null;
    filmTitle: string | null;
    filmYear: number | null;
    contributors: string[];
    songTitle: string | null;
    performerName: string | null;
    performerCharacter: string | null;
    performerProfileUrl: string | null;
    performerProfilePath: string | null;
    performerContributors?: Array<{
      fullName: string;
      roleLabel: string | null;
      profileUrl: string | null;
      profilePath: string | null;
      sortOrder: number;
    }>;
    draftedByLabel?: string | null;
    draftedByAvatarKey?: string | null;
    draftedRoundPick?: string | null;
  }>;
  // A11y / focus behavior is controlled by glue; this component only consumes the ref.
  firstPillRef?: RefObject<HTMLButtonElement | null> | null;
  canDraftAction: boolean;
  hoveredNominationIds?: Set<number>;
  isKeyboardMode: boolean;
  setKeyboardMode: (categoryId: string | null) => void;
  onNomineeClick: (nominationId: number, label: string) => void;
  onNomineeDoubleClick: (nominationId: number) => void;
}) {
  const tooltipsEnabled = props.tooltipsEnabled ?? true;

  return (
    <Box
      className="dr-card"
      onFocusCapture={() => props.setKeyboardMode(props.categoryId)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          props.setKeyboardMode(null);
        }
      }}
    >
      <UnstyledButton
        type="button"
        className="dr-card-titleRow"
        aria-label={`Category: ${props.title}`}
        onClick={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          props.setKeyboardMode(props.categoryId);
          // Focus the first pill (if present) to enter "pills" mode.
          props.firstPillRef?.current?.focus();
        }}
      >
        <DraftCategoryIcon icon={props.icon} variant={props.iconVariant} />
        <Text className="dr-card-title">{props.title}</Text>
        {props.weightText ? (
          <Text component="span" className="dr-card-weight">
            {props.weightText}
          </Text>
        ) : null}
      </UnstyledButton>
      <Box className="dr-card-pills">
        {props.nominees.length === 0 ? (
          <Box className="dr-pill is-muted">
            <Text component="span" className="dr-pill-text">
              No nominees
            </Text>
          </Box>
        ) : (
          props.nominees.map((n, idx) => {
            const isArmed = props.canDraftAction && n.selected;
            const button = (
              <UnstyledButton
                type="button"
                className={[
                  "dr-pill",
                  "dr-pill-btn",
                  isArmed ? "is-armed" : "",
                  props.hoveredNominationIds?.has(Number(n.id)) ? "is-hoverMatch" : "",
                  n.muted ? "is-muted" : "",
                  n.winner ? "is-winner" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                ref={idx === 0 ? (props.firstPillRef ?? undefined) : undefined}
                aria-disabled={!props.canDraftAction}
                aria-label={`${props.title}: ${n.label}`}
                aria-keyshortcuts="Enter Space Shift+Enter Escape"
                aria-pressed={isArmed}
                aria-describedby={isArmed ? `dr-pill-hint-${n.id}` : undefined}
                tabIndex={props.isKeyboardMode ? 0 : -1}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  props.setKeyboardMode(props.categoryId);
                  props.onNomineeClick(Number(n.id), n.label);
                }}
                onDoubleClick={(e) => {
                  if (!props.canDraftAction) return;
                  e.preventDefault();
                  e.stopPropagation();
                  props.setKeyboardMode(props.categoryId);
                  props.onNomineeDoubleClick(Number(n.id));
                }}
                onKeyDown={(e) => {
                  // Held keys (OS auto-repeat) never act.
                  if (e.repeat) {
                    if (["Enter", " ", "Escape"].includes(e.key)) e.preventDefault();
                    return;
                  }
                  // Confirming is its own chord: Shift+Enter. Plain Enter/Space only
                  // arm or disarm, so a double-tap can never draft by accident.
                  if (e.shiftKey && e.key === "Enter") {
                    if (!props.canDraftAction) return;
                    e.preventDefault();
                    e.stopPropagation();
                    props.onNomineeDoubleClick(Number(n.id));
                    return;
                  }
                  if (e.key === "Escape" && isArmed) {
                    // Disarm (a click on a selected nominee toggles it off).
                    e.preventDefault();
                    e.stopPropagation();
                    props.onNomineeClick(Number(n.id), n.label);
                    return;
                  }
                  // Space acts on keyup (see onKeyUp) so it fires exactly once per press.
                  if (e.key === " ") {
                    e.preventDefault();
                    return;
                  }
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  e.stopPropagation();
                  props.onNomineeClick(Number(n.id), n.label);
                }}
                onKeyUp={(e) => {
                  if (e.key !== " ") return;
                  // preventDefault stops browsers that synthesize a click from Space keyup.
                  e.preventDefault();
                  e.stopPropagation();
                  props.onNomineeClick(Number(n.id), n.label);
                }}
              >
                <Text component="span" className="dr-pill-text">
                  {n.label}
                </Text>
                {isArmed ? (
                  <VisuallyHidden id={`dr-pill-hint-${n.id}`}>
                    Selected. Press Shift+Enter to draft, Escape to cancel.
                  </VisuallyHidden>
                ) : null}
              </UnstyledButton>
            );

            if (!tooltipsEnabled) return <Box key={n.id}>{button}</Box>;

            return (
              <Tooltip
                key={n.id}
                events={NOMINEE_TOOLTIP_EVENTS}
                withArrow={false}
                position="bottom-start"
                multiline
                offset={NOMINEE_TOOLTIP_OFFSET_PX}
                styles={NOMINEE_CARD_TOOLTIP_STYLES}
                opened={isArmed ? true : undefined}
                label={
                  <NomineeTooltipCard
                    unitKind={props.unitKind}
                    categoryName={props.title}
                    filmTitle={n.filmTitle}
                    filmYear={n.filmYear}
                    filmPosterUrl={n.posterUrl}
                    contributors={n.contributors}
                    performerName={n.performerName}
                    performerCharacter={n.performerCharacter}
                    performerProfileUrl={n.performerProfileUrl}
                    performerProfilePath={n.performerProfilePath}
                    performerContributors={n.performerContributors}
                    songTitle={n.songTitle}
                    draftedByLabel={n.draftedByLabel}
                    draftedByAvatarKey={n.draftedByAvatarKey}
                    draftedRoundPick={n.draftedRoundPick}
                    action={
                      isArmed ? (
                        <Button
                          variant="filled"
                          fullWidth
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            props.onNomineeDoubleClick(Number(n.id));
                          }}
                        >
                          Confirm draft pick
                        </Button>
                      ) : null
                    }
                  />
                }
              >
                {button}
              </Tooltip>
            );
          })
        )}
      </Box>
    </Box>
  );
}
