import { Box, Text, Tooltip, UnstyledButton } from "@ui";
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
  }>;
  // A11y / focus behavior is controlled by glue; this component only consumes the ref.
  firstPillRef?: RefObject<HTMLButtonElement | null> | null;
  canDraftAction: boolean;
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
            const button = (
              <UnstyledButton
                type="button"
                className={[
                  "dr-pill",
                  "dr-pill-btn",
                  n.muted ? "is-muted" : "",
                  n.winner ? "is-winner" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                ref={idx === 0 ? (props.firstPillRef ?? undefined) : undefined}
                aria-disabled={!props.canDraftAction}
                aria-label={`${props.title}: ${n.label}`}
                aria-keyshortcuts="Shift+Enter"
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
                  if (e.shiftKey && e.key === "Enter") {
                    if (!props.canDraftAction) return;
                    e.preventDefault();
                    e.stopPropagation();
                    props.onNomineeDoubleClick(Number(n.id));
                    return;
                  }
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  e.stopPropagation();
                  props.onNomineeClick(Number(n.id), n.label);
                }}
              >
                <Text component="span" className="dr-pill-text">
                  {n.label}
                </Text>
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
                    songTitle={n.songTitle}
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
