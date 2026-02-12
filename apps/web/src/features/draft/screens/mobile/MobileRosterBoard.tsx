import type { DraftRoomOrchestration } from "@/orchestration/draft";
import { Box, Select, Stack, Text, Tooltip } from "@ui";
import { useEffect, useMemo, useState } from "react";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";
import { pickDeterministicAvatarKey } from "@/decisions/avatars";
import { DraftCategoryIcon } from "@/features/draft/ui/DraftCategoryIcon";
import { NomineeTooltipCard } from "@/features/draft/components/NomineeTooltipCard";
import { formatSignedInt } from "@/decisions/draftRoomLayout";
import {
  NOMINEE_CARD_TOOLTIP_STYLES,
  NOMINEE_TOOLTIP_EVENTS,
  NOMINEE_TOOLTIP_OFFSET_PX
} from "@/features/draft/ui/nomineeTooltip";

export function MobileRosterBoard(props: {
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
      songTitle: string | null;
      categoryIcon: string;
      categoryIconVariant: "default" | "inverted";
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

  const [seat, setSeat] = useState<number | null>(() => players[0]?.seatNumber ?? null);
  useEffect(() => {
    setSeat((prev) => {
      if (prev == null) return players[0]?.seatNumber ?? null;
      if (players.some((p) => p.seatNumber === prev)) return prev;
      return players[0]?.seatNumber ?? null;
    });
  }, [players]);

  const current =
    seat != null ? (players.find((p) => p.seatNumber === seat) ?? null) : null;
  const picks = seat != null ? (o.rosterBoard.rowsBySeat.get(seat) ?? []) : [];
  const showWeightedPoints =
    Boolean(o.header.isFinalResults) &&
    o.header.scoringStrategyName === "category_weighted";

  return (
    <Stack gap="sm">
      <Select
        label="Roster"
        value={seat != null ? String(seat) : null}
        onChange={(v) => setSeat(v ? Number(v) : null)}
        data={players.map((p) => ({
          value: String(p.seatNumber),
          label:
            o.header.status === "COMPLETED" ? `${p.label} (${p.winnerCount})` : p.label
        }))}
      />

      {current ? (
        <Box className="dr-card dr-rosterCard">
          <Box className="dr-card-titleRow">
            <AnimalAvatarIcon avatarKey={current.avatarKey} size="md" />
            <Text className="dr-card-title fo-flex1Minw0" lineClamp={1}>
              {current.label}
            </Text>
            {o.header.status === "COMPLETED" ? (
              <Text
                className="dr-rosterWinCount"
                aria-label={`${current.winnerCount} winners`}
              >
                {current.winnerCount}
              </Text>
            ) : null}
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
                <Box key={`${pick.pickNumber}`}>
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
                          songTitle={nominee.songTitle}
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
      ) : (
        <Text className="baseline-textBody">No roster.</Text>
      )}
    </Stack>
  );
}
