import { Box, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { NomineeTooltipCard } from "../../components/draft/NomineeTooltipCard";
import { DraftCategoryIcon } from "./DraftCategoryIcon";
import { NOMINEE_CARD_TOOLTIP_STYLES, NOMINEE_TOOLTIP_EVENTS } from "./nomineeTooltip";
import type { DraftNomineeMeta, DraftRosterPick } from "./types";

export function DraftMyRosterRail(props: {
  open: boolean;
  setOpen: (open: boolean) => void;
  isPre: boolean;
  compactRails: boolean;
  openRailExclusive: (rail: "ledger" | "roster" | "auto") => void;
  myPicks: DraftRosterPick[];
  nomineeById: Map<number, DraftNomineeMeta>;
}) {
  const { open, setOpen, isPre, compactRails, openRailExclusive } = props;

  return (
    <Box className={["dr-rail", "dr-rail-roster", open ? "is-open" : "is-collapsed"].join(" ")}>
      {open ? (
        <Box className="dr-railPane">
          <Box className="dr-railPaneHeader">
            <Box className="dr-railPaneTitleRow">
              <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
                patient_list
              </Text>
              <Text className="dr-railPaneTitle">My roster</Text>
            </Box>
            <UnstyledButton
              type="button"
              className="dr-railClose"
              aria-label="Collapse my roster"
              onClick={() => setOpen(false)}
            >
              <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
                chevron_right
              </Text>
            </UnstyledButton>
          </Box>
          <Box className="dr-railPaneBody" role="region" aria-label="My roster" tabIndex={0}>
            <Box className="dr-railList">
              {props.myPicks.length === 0 ? (
                <Text className="dr-railEmpty">No picks yet</Text>
              ) : (
                props.myPicks.map((p) => {
                  const nominee = props.nomineeById.get(p.nominationId) ?? null;
                  const pill = (
                    <Box
                      className={["dr-pill", "dr-pill-static", p.winner ? "is-winner" : ""].filter(Boolean).join(" ")}
                      tabIndex={nominee ? 0 : undefined}
                      role={nominee ? "group" : undefined}
                      aria-label={nominee ? `${nominee.categoryName}: ${p.label}` : undefined}
                    >
                      {nominee ? (
                        <DraftCategoryIcon icon={nominee.categoryIcon} variant={nominee.categoryIconVariant} className="dr-pill-icon" />
                      ) : p.icon ? (
                        <DraftCategoryIcon icon={p.icon} variant="default" className="dr-pill-icon" />
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
                          offset={10}
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
                              songTitle={nominee.songTitle}
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
          </Box>
        </Box>
      ) : (
        <UnstyledButton
          type="button"
          className="dr-railToggle"
          aria-label="Expand my roster"
          onClick={() => {
            if (isPre) return;
            if (compactRails) openRailExclusive("roster");
            else setOpen(true);
          }}
        >
          <Text component="span" className="mi-icon dr-railStubIcon" aria-hidden="true">
            patient_list
          </Text>
        </UnstyledButton>
      )}
    </Box>
  );
}
