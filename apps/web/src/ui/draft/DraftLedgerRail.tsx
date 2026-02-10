import { Box, Text, Tooltip, UnstyledButton } from "@mantine/core";
import type { DraftRoomOrchestration } from "../../orchestration/draft";
import { NomineeTooltipCard } from "../../components/draft/NomineeTooltipCard";
import { pickDeterministicAvatarKey } from "../../decisions/avatars";
import { AnimalAvatarIcon } from "../animalAvatarIcon";
import { DraftCategoryIcon } from "./DraftCategoryIcon";
import { NOMINEE_CARD_TOOLTIP_STYLES, NOMINEE_TOOLTIP_EVENTS } from "./nomineeTooltip";

export function DraftLedgerRail(props: {
  open: boolean;
  setOpen: (open: boolean) => void;
  isPre: boolean;
  compactRails: boolean;
  openRailExclusive: (rail: "ledger" | "roster" | "auto") => void;
  ledgerRows: DraftRoomOrchestration["ledger"]["rows"];
  avatarKeyBySeat: Map<number, string | null>;
  nomineeById: Map<
    number,
    {
      unitKind: string;
      categoryName: string;
      filmTitle: string | null;
      filmYear: number | null;
      filmPosterUrl: string | null;
      contributors: string[];
      performerName: string | null;
      performerCharacter: string | null;
      performerProfileUrl: string | null;
      performerProfilePath: string | null;
      songTitle: string | null;
      categoryIcon: string;
      categoryIconVariant: "default" | "inverted";
    }
  >;
}) {
  const { open, setOpen, isPre, compactRails, openRailExclusive } = props;

  return (
    <Box className={["dr-rail", "dr-rail-ledger", open ? "is-open" : "is-collapsed"].join(" ")}>
      {open ? (
        <Box className="dr-railPane">
          <Box className="dr-railPaneHeader">
            <Box className="dr-railPaneTitleRow">
              <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
                history
              </Text>
              <Text className="dr-railPaneTitle">Draft History</Text>
            </Box>
            <UnstyledButton
              type="button"
              className="dr-railClose"
              aria-label="Collapse draft history"
              onClick={() => setOpen(false)}
            >
              <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
                chevron_left
              </Text>
            </UnstyledButton>
          </Box>
          <Box className="dr-railPaneBody" role="region" aria-label="Draft history" tabIndex={0}>
            <Box className="dr-railList">
              {props.ledgerRows.map((r) => {
                const nominee = r.nominationId ? (props.nomineeById.get(r.nominationId) ?? null) : null;
                const avatarKey =
                  r.seatNumber !== null
                    ? (props.avatarKeyBySeat.get(r.seatNumber) ?? pickDeterministicAvatarKey(r.seatLabel))
                    : null;
                const pill = (
                  <Box
                    className={["dr-pill", "dr-pill-static", r.label === "—" ? "is-muted" : "", r.winner ? "is-winner" : ""]
                      .filter(Boolean)
                      .join(" ")}
                    tabIndex={nominee ? 0 : undefined}
                    role={nominee ? "group" : undefined}
                    aria-label={nominee ? `${nominee.categoryName}: ${r.label}` : undefined}
                  >
                    {nominee ? (
                      <DraftCategoryIcon icon={nominee.categoryIcon} variant={nominee.categoryIconVariant} className="dr-pill-icon" />
                    ) : r.icon ? (
                      <DraftCategoryIcon icon={r.icon} variant="default" className="dr-pill-icon" />
                    ) : null}
                    <Text component="span" className="dr-pill-text" lineClamp={1}>
                      {r.label}
                    </Text>
                  </Box>
                );

                return (
                  <Box key={r.pickNumber} className="dr-railRow dr-ledgerRow" data-active={r.active ? "true" : "false"}>
                    <Text className="dr-railMeta">{r.roundPick}</Text>
                    <Box className="dr-railAvatar">
                      <AnimalAvatarIcon avatarKey={avatarKey} size={22} />
                    </Box>
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
              })}
            </Box>
          </Box>
        </Box>
      ) : (
        <UnstyledButton
          type="button"
          className="dr-railToggle"
          aria-label="Expand draft history"
          onClick={() => {
            if (isPre) return;
            if (compactRails) openRailExclusive("ledger");
            else setOpen(true);
          }}
        >
          <Text component="span" className="mi-icon dr-railStubIcon" aria-hidden="true">
            history
          </Text>
        </UnstyledButton>
      )}
    </Box>
  );
}

