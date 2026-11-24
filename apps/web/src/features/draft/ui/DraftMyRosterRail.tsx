import { useMemo, useRef } from "react";
import { Box, Text, Tooltip } from "@ui";
import { railMetaCh } from "@/decisions/draft/railMeta";
import { useCssVars } from "@/shared/dom/useCssVars";
import { NomineeTooltipCard } from "@/shared/nominee/NomineeTooltipCard";
import { DraftCategoryIcon } from "@/shared/nominee/DraftCategoryIcon";
import {
  NOMINEE_CARD_TOOLTIP_STYLES,
  NOMINEE_TOOLTIP_EVENTS,
  NOMINEE_TOOLTIP_OFFSET_PX
} from "@/shared/nominee/nomineeTooltip";
import { DraftRail } from "./DraftRail";
import type { DraftNomineeMeta, DraftRosterPick } from "./types";

export function DraftMyRosterRail(props: {
  open: boolean;
  setOpen: (open: boolean) => void;
  isPre: boolean;
  compactRails: boolean;
  openRailExclusive: (rail: "ledger" | "roster" | "auto") => void;
  myPicks: DraftRosterPick[];
  nomineeById: Map<number, DraftNomineeMeta>;
  hoveredNominationIds: Set<number>;
}) {
  const { open, setOpen, isPre, compactRails, openRailExclusive } = props;
  const listRef = useRef<HTMLDivElement>(null);
  const railVars = useMemo(
    () => ({ "--dr-meta-ch": railMetaCh(props.myPicks.map((p) => p.roundPick)) }),
    [props.myPicks]
  );
  useCssVars(listRef, railVars);

  return (
    <DraftRail
      kind="roster"
      open={open}
      setOpen={setOpen}
      icon="patient_list"
      title="My roster"
      side="right"
      disabled={isPre}
      disabledTitle="My roster (available after draft starts)"
      compactRails={compactRails}
      openExclusive={() => openRailExclusive("roster")}
    >
      <Box className="dr-railList" ref={listRef}>
        {props.myPicks.length === 0 ? (
          <Text className="dr-railEmpty">No picks yet</Text>
        ) : (
          props.myPicks.map((p) => {
            const nominee = props.nomineeById.get(p.nominationId) ?? null;
            const pill = (
              <Box
                className={[
                  "dr-pill",
                  "dr-pill-static",
                  props.hoveredNominationIds.has(p.nominationId) ? "is-hoverMatch" : "",
                  p.winner ? "is-winner" : "",
                  p.pending ? "is-pending" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                tabIndex={nominee ? 0 : undefined}
                role={nominee ? "group" : undefined}
                aria-label={
                  nominee
                    ? `${nominee.categoryName}: ${p.label}${p.pending ? " (pending)" : ""}`
                    : undefined
                }
              >
                {nominee ? (
                  <DraftCategoryIcon
                    icon={nominee.categoryIcon}
                    variant={nominee.categoryIconVariant}
                    className="dr-pill-icon"
                  />
                ) : p.icon ? (
                  <DraftCategoryIcon
                    icon={p.icon}
                    variant="default"
                    className="dr-pill-icon"
                  />
                ) : null}
                <Text component="span" className="dr-pill-text" lineClamp={1}>
                  {p.label}
                </Text>
              </Box>
            );
            return (
              <Box key={p.pickNumber} className="dr-railRow dr-rosterRow">
                <Text className="dr-railMeta">{p.roundPick}</Text>
                {nominee ? (
                  <Tooltip
                    events={NOMINEE_TOOLTIP_EVENTS}
                    withArrow={false}
                    position="bottom-start"
                    multiline
                    offset={NOMINEE_TOOLTIP_OFFSET_PX}
                    styles={NOMINEE_CARD_TOOLTIP_STYLES}
                    label={
                      <NomineeTooltipCard
                        unitKind={nominee.unitKind}
                        categoryName={nominee.categoryName}
                        filmTitle={nominee.filmTitle}
                        filmYear={nominee.filmYear}
                        filmPosterUrl={nominee.filmPosterUrl}
                        contributors={nominee.contributors}
                        performerName={nominee.performerName}
                        performerCharacter={nominee.performerCharacter}
                        performerProfileUrl={nominee.performerProfileUrl}
                        performerProfilePath={nominee.performerProfilePath}
                        performerContributors={nominee.performerContributors}
                        songTitle={nominee.songTitle}
                        draftedByLabel={nominee.draftedByLabel}
                        draftedByAvatarKey={nominee.draftedByAvatarKey}
                        draftedRoundPick={nominee.draftedRoundPick}
                      />
                    }
                  >
                    {pill}
                  </Tooltip>
                ) : (
                  pill
                )}
              </Box>
            );
          })
        )}
      </Box>
    </DraftRail>
  );
}
