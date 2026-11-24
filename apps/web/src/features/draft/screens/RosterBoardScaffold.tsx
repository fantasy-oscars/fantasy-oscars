import { Box, Stack, Text, Tooltip } from "@ui";
import { useMemo } from "react";
import type { DraftRoomOrchestration } from "@/orchestration/draft";
import { pickDeterministicAvatarKey } from "@/decisions/avatars";
import { formatSignedInt } from "@/decisions/draftRoomLayout";
import { NomineeTooltipCard } from "@/shared/nominee/NomineeTooltipCard";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";
import { DraftCategoryIcon } from "@/shared/nominee/DraftCategoryIcon";
import { RosterTrack } from "@/features/draft/ui/RosterTrack";
import { useRosterRotation } from "@/orchestration/draft/useRosterRotation";
import {
  NOMINEE_CARD_TOOLTIP_STYLES,
  NOMINEE_TOOLTIP_EVENTS,
  NOMINEE_TOOLTIP_OFFSET_PX
} from "@/shared/nominee/nomineeTooltip";

export function RosterBoardScaffold(props: {
  o: DraftRoomOrchestration;
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
      performerContributors?: Array<{
        fullName: string;
        roleLabel: string | null;
        profileUrl: string | null;
        profilePath: string | null;
        sortOrder: number;
      }>;
      songTitle: string | null;
      categoryIcon: string;
      categoryIconVariant: "default" | "inverted";
      draftedByLabel?: string | null;
      draftedByAvatarKey?: string | null;
      draftedRoundPick?: string | null;
    }
  >;
}) {
  const { o } = props;

  const participantsBySeat = useMemo(() => {
    const m = new Map<number, { label: string; avatarKey: string | null }>();
    for (const p of o.header.participants) {
      m.set(p.seatNumber, { label: p.label, avatarKey: p.avatarKey ?? null });
    }
    return m;
  }, [o.header.participants]);

  const players = useMemo(() => {
    const seats = o.rosterBoard.seats.length
      ? o.rosterBoard.seats
      : o.header.participants.map((p) => ({
          seatNumber: p.seatNumber,
          username: p.label,
          winnerCount: 0
        }));
    return [...seats]
      .sort((a, b) => a.seatNumber - b.seatNumber)
      .map((s) => {
        const p = participantsBySeat.get(s.seatNumber);
        const label = s.username ?? p?.label ?? `Seat ${s.seatNumber}`;
        const avatarKey = p?.avatarKey ?? pickDeterministicAvatarKey(label);
        return {
          seatNumber: s.seatNumber,
          label,
          avatarKey,
          winnerCount: s.winnerCount ?? 0
        };
      });
  }, [o.header.participants, o.rosterBoard.seats, participantsBySeat]);

  const rotation = useRosterRotation({ count: players.length, layout: "desktop" });
  const showWeightedPoints =
    Boolean(o.header.isFinalResults) &&
    o.header.scoringStrategyName === "category_weighted";
  const renderColumn = (index: number) => {
    const p = players[index];
    if (!p) return null;
    const picks = o.rosterBoard.rowsBySeat.get(p.seatNumber) ?? [];
    return (
      <Box className="dr-card dr-rosterCard">
        <Box className="dr-card-titleRow">
          <AnimalAvatarIcon avatarKey={p.avatarKey} size="md" />
          <Text className="dr-card-title fo-flex1Minw0" title={p.label}>
            {p.label}
          </Text>
          <Text className="dr-rosterWinCount" aria-label={`${p.winnerCount} winners`}>
            {p.winnerCount}
          </Text>
        </Box>
        <Stack gap="var(--fo-space-4)" className="dr-card-pills">
          {picks.map((pick) => {
            const nominee =
              pick.nominationId != null
                ? (props.nomineeById.get(pick.nominationId) ?? null)
                : null;

            const pill = (
              <Box
                className={["dr-pill", "dr-pill-static", pick.winner ? "is-winner" : ""]
                  .filter(Boolean)
                  .join(" ")}
                tabIndex={0}
                role="group"
                aria-label={
                  nominee
                    ? `${nominee.categoryName}: ${pick.label}`
                    : `Nomination: ${pick.label}`
                }
              >
                {nominee ? (
                  <DraftCategoryIcon
                    icon={nominee.categoryIcon}
                    variant={nominee.categoryIconVariant}
                    className="dr-pill-icon"
                  />
                ) : pick.icon ? (
                  <DraftCategoryIcon
                    icon={pick.icon}
                    variant="default"
                    className="dr-pill-icon"
                  />
                ) : null}
                <Text component="span" className="dr-pill-text dr-rosterPickText">
                  {pick.label}
                </Text>
                {showWeightedPoints ? (
                  <Text component="span" className="dr-pill-points">
                    {pick.winner && pick.nominationId != null
                      ? formatSignedInt(o.header.getNominationPoints(pick.nominationId))
                      : "0"}
                  </Text>
                ) : null}
              </Box>
            );

            return (
              <Box key={`${p.seatNumber}-${pick.pickNumber}`}>
                <Tooltip
                  events={NOMINEE_TOOLTIP_EVENTS}
                  withArrow={!nominee}
                  position="bottom-start"
                  multiline
                  offset={NOMINEE_TOOLTIP_OFFSET_PX}
                  styles={nominee ? NOMINEE_CARD_TOOLTIP_STYLES : undefined}
                  label={
                    nominee ? (
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
                    ) : (
                      <Text className="baseline-textBody">{pick.label}</Text>
                    )
                  }
                >
                  {pill}
                </Tooltip>
              </Box>
            );
          })}
        </Stack>
      </Box>
    );
  };

  return (
    <Box className="dr-middle dr-roster">
      <RosterTrack
        rotation={rotation}
        renderColumn={renderColumn}
        columnKey={(index) => players[index]?.seatNumber ?? index}
      />
    </Box>
  );
}
