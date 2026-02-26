import { Box, Text, Tooltip, UnstyledButton } from "@ui";
import { NomineeTooltipCard } from "@/features/draft/components/NomineeTooltipCard";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";
import { DraftCategoryIcon } from "./DraftCategoryIcon";
import {
  NOMINEE_CARD_TOOLTIP_STYLES,
  NOMINEE_TOOLTIP_EVENTS,
  NOMINEE_TOOLTIP_OFFSET_PX
} from "./nomineeTooltip";
import type { DraftLedgerRow, DraftNomineeMeta } from "./types";

export function DraftLedgerRail(props: {
  open: boolean;
  setOpen: (open: boolean) => void;
  isPre: boolean;
  compactRails: boolean;
  openRailExclusive: (rail: "ledger" | "roster" | "auto") => void;
  ledgerRows: DraftLedgerRow[];
  avatarKeyBySeat: Map<number, string | null>;
  nomineeById: Map<number, DraftNomineeMeta>;
  hoveredNominationIds: Set<number>;
}) {
  const { open, setOpen, isPre, compactRails, openRailExclusive } = props;

  return (
    <Box
      className={["dr-rail", "dr-rail-ledger", open ? "is-open" : "is-collapsed"].join(
        " "
      )}
    >
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
          <Box
            className="dr-railPaneBody"
            role="region"
            aria-label="Draft history"
            tabIndex={0}
          >
            <Box className="dr-railList">
              {props.ledgerRows.map((r) => {
                const nominee = r.nominationId
                  ? (props.nomineeById.get(r.nominationId) ?? null)
                  : null;
                const avatarKey =
                  r.seatNumber !== null
                    ? (props.avatarKeyBySeat.get(r.seatNumber) ?? null)
                    : null;
                const pill = (
                  <Box
                    className={[
                      "dr-pill",
                      "dr-pill-static",
                      r.nominationId != null &&
                      props.hoveredNominationIds.has(r.nominationId)
                        ? "is-hoverMatch"
                        : "",
                      r.label === "—" ? "is-muted" : "",
                      r.winner ? "is-winner" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    tabIndex={nominee ? 0 : undefined}
                    role={nominee ? "group" : undefined}
                    aria-label={
                      nominee ? `${nominee.categoryName}: ${r.label}` : undefined
                    }
                  >
                    {nominee ? (
                      <DraftCategoryIcon
                        icon={nominee.categoryIcon}
                        variant={nominee.categoryIconVariant}
                        className="dr-pill-icon"
                      />
                    ) : r.icon ? (
                      <DraftCategoryIcon
                        icon={r.icon}
                        variant="default"
                        className="dr-pill-icon"
                      />
                    ) : null}
                    <Text component="span" className="dr-pill-text" lineClamp={1}>
                      {r.label}
                    </Text>
                  </Box>
                );

                return (
                  <Box
                    key={r.pickNumber}
                    className="dr-railRow dr-ledgerRow"
                    data-active={r.active ? "true" : "false"}
                  >
                    <Text className="dr-railMeta">{r.roundPick}</Text>
                    <Box className="dr-railAvatar">
                      <AnimalAvatarIcon avatarKey={avatarKey} />
                    </Box>
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
              })}
            </Box>
          </Box>
        </Box>
      ) : (
        <UnstyledButton
          type="button"
          className={["dr-railToggle", isPre ? "is-disabled" : ""]
            .filter(Boolean)
            .join(" ")}
          aria-label="Expand draft history"
          aria-disabled={isPre}
          title={isPre ? "Draft history (available after draft starts)" : "Draft history"}
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
