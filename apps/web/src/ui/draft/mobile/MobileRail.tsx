import { Box, Checkbox, Select, Stack, Text, Tooltip } from "@mantine/core";
import { AnimalAvatarIcon } from "../../animalAvatarIcon";
import { DraftCategoryIcon } from "../DraftCategoryIcon";
import { NomineeTooltipCard } from "../../../components/draft/NomineeTooltipCard";
import {
  NOMINEE_CARD_TOOLTIP_STYLES,
  NOMINEE_TOOLTIP_EVENTS
} from "../nomineeTooltip";
import type { AutoDraftState, DraftLedgerRow, DraftNomineeMeta, DraftRosterPick } from "../types";

type MobileDraftRailOrchestration = {
  ledger: { rows: DraftLedgerRow[] };
  myRoster: { picks: DraftRosterPick[] };
  autodraft: AutoDraftState;
};

export function MobileRail(props: {
  rail: "ledger" | "roster" | "autodraft";
  o: MobileDraftRailOrchestration;
  avatarKeyBySeat: Map<number, string | null>;
  nomineeById: Map<number, DraftNomineeMeta>;
  draftedNominationIds: Set<number>;
}) {
  const { o } = props;

  if (props.rail === "ledger") {
    return (
      <Box className="dr-mobileRailPane">
        <Text className="dr-railPaneTitle">Draft History</Text>
        <Box className="dr-railRows">
          {o.ledger.rows.map((r) => {
            const seatNumber = r.seatNumber;
            const avatarKey =
              typeof seatNumber === "number"
                ? (props.avatarKeyBySeat.get(seatNumber) ?? null)
                : null;
            const nominee =
              typeof r.nominationId === "number"
                ? (props.nomineeById.get(r.nominationId) ?? null)
                : null;

            const pill = (
              <Box
                className={[
                  "dr-pill",
                  "dr-pill-static",
                  r.label === "—" ? "is-muted" : "",
                  r.winner ? "is-winner" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                tabIndex={nominee ? 0 : undefined}
                role={nominee ? "group" : undefined}
                aria-label={nominee ? `${nominee.categoryName}: ${r.label}` : undefined}
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
              <Box key={r.pickNumber} className="dr-railRow dr-ledgerRow">
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
    );
  }

  if (props.rail === "roster") {
    return (
      <Box className="dr-mobileRailPane">
        <Text className="dr-railPaneTitle">My Roster</Text>
        <Box className="dr-railRows">
          {o.myRoster.picks.map((r) => {
            const nominee =
              typeof r.nominationId === "number"
                ? (props.nomineeById.get(r.nominationId) ?? null)
                : null;

            const pill = (
              <Box
                className={[
                  "dr-pill",
                  "dr-pill-static",
                  r.label === "—" ? "is-muted" : "",
                  r.winner ? "is-winner" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                tabIndex={nominee ? 0 : undefined}
                role={nominee ? "group" : undefined}
                aria-label={nominee ? `${nominee.categoryName}: ${r.label}` : undefined}
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
              <Box key={r.pickNumber} className="dr-railRow">
                <Text className="dr-railMeta">{r.roundPick}</Text>
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
    );
  }

  return (
    <Box className="dr-mobileRailPane">
      <Text className="dr-railPaneTitle">Auto-Draft</Text>
      <Stack gap="sm">
        <Checkbox
          checked={o.autodraft.enabled}
          onChange={(e) => o.autodraft.setEnabled(e.currentTarget.checked)}
          label="Enable auto-drafting"
        />
        <Select
          label="Strategy"
          value={o.autodraft.strategy}
          onChange={(v) =>
            o.autodraft.setStrategy(
              (v as "random" | "by_category" | "alphabetical" | "wisdom" | "custom") ??
                "random"
            )
          }
          data={[
            { value: "random", label: "Random" },
            { value: "by_category", label: "By category" },
            { value: "alphabetical", label: "Alphabetical" },
            { value: "wisdom", label: "Wisdom of crowds" },
            { value: "custom", label: "Custom", disabled: o.autodraft.plans.length === 0 }
          ]}
          allowDeselect={false}
        />

        {o.autodraft.strategy === "custom" ? (
          <Select
            label="Plan"
            placeholder={o.autodraft.plans.length === 0 ? "No plans available" : "Choose…"}
            value={o.autodraft.selectedPlanId ? String(o.autodraft.selectedPlanId) : null}
            onChange={(v) => o.autodraft.setSelectedPlanId(v ? Number(v) : null)}
            data={o.autodraft.plans.map((p) => ({
              value: String(p.id),
              label: p.name
            }))}
            disabled={o.autodraft.plans.length === 0}
            searchable
            clearable
          />
        ) : null}

        {o.autodraft.strategy === "custom" ? (
          <Box>
            {o.autodraft.list.length === 0 ? (
              <Text className="baseline-textBody">No nominees.</Text>
            ) : (
              <Stack gap={6}>
                {o.autodraft.list.map((item) => {
                  const nominee = props.nomineeById.get(item.nominationId) ?? null;
                  const isDrafted = props.draftedNominationIds.has(item.nominationId);
                  const pill = (
                    <Box
                      className={["dr-pill", "dr-pill-static", isDrafted ? "is-muted" : ""]
                        .filter(Boolean)
                        .join(" ")}
                      tabIndex={nominee ? 0 : undefined}
                      role={nominee ? "group" : undefined}
                      aria-label={nominee ? `${nominee.categoryName}: ${item.label}` : undefined}
                    >
                      {nominee ? (
                        <DraftCategoryIcon
                          icon={nominee.categoryIcon}
                          variant={nominee.categoryIconVariant}
                          className="dr-pill-icon"
                        />
                      ) : item.icon ? (
                        <DraftCategoryIcon
                          icon={item.icon}
                          variant="default"
                          className="dr-pill-icon"
                        />
                      ) : null}
                      <Text component="span" className="dr-pill-text" lineClamp={1}>
                        {item.label}
                      </Text>
                    </Box>
                  );

                  return nominee ? (
                    <Tooltip
                      key={item.nominationId}
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
                    <Box key={item.nominationId}>{pill}</Box>
                  );
                })}
              </Stack>
            )}
          </Box>
        ) : null}
      </Stack>
    </Box>
  );
}
