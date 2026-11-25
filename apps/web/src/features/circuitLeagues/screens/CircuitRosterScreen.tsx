import { useState } from "react";
import { Link } from "react-router-dom";
import { Box, Button, Select, Stack, Text } from "@ui";
import { useMediaQuery } from "@ui/hooks";
import type { CircuitRosterView } from "@/orchestration/circuitRoster";
import {
  circuitDropPlaceholder,
  type CircuitRosterEntry
} from "@/decisions/circuitRoster";
import type { CircuitRosterPick } from "@/decisions/circuitPoints";
import type { ApiResult, CircuitSelectionSummary } from "@/lib/types";
import { FO_BP_MOBILE_MAX_PX } from "@/tokens/breakpoints";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";
import { PlayerName } from "@/shared/PlayerName";
import {
  circuitLeaguePath,
  circuitTransactionsPath,
  circuitWaiversPath
} from "@/lib/routes";
import { circuitWaiversVisible } from "@/decisions/circuitWaivers";
import {
  CircuitPageError,
  CircuitPageFrame,
  CircuitPageSkeleton
} from "@/features/circuitLeagues/ui/CircuitPageFrame";
import { CircuitRosterList } from "@/features/circuitLeagues/ui/CircuitRosterList";
import {
  CIRCUIT_FREE_AGENCY_HEADING_ID,
  CircuitFreeAgentPanel
} from "@/features/circuitLeagues/ui/CircuitFreeAgentPanel";
import { ContenderCardModal } from "@/features/circuitLeagues/ui/ContenderCardModal";
import {
  withContenderPreview,
  type CircuitSeasonPicker
} from "@/features/circuitLeagues/ui/ContenderPreviewRow";
import { useHashFocus } from "./useHashFocus";

/** The season's contender picker, with the chosen contender's owner once it is read. */
export type CircuitRosterPicker = CircuitSeasonPicker;

export function CircuitRosterScreen(props: {
  view: CircuitRosterView;
  /** Whose roster the member select shows; null is the viewer's own. */
  memberUserId: number | null;
  viewerUserId: number | null;
  /** The contender picker, once the season is known. */
  picker: CircuitRosterPicker | null;
  pending: CircuitSelectionSummary | null;
  dropSelectionId: number | null;
  dropOptions: CircuitRosterEntry[];
  adding: boolean;
  droppingSelectionId: number | null;
  addStatus: ApiResult | null;
  dropStatus: ApiResult | null;
  onSelectMember: (userId: number | null) => void;
  onChooseDrop: (selectionId: number | null) => void;
  onRetryAdd: () => void;
  onCancelAdd: () => void;
  onDrop: (entry: CircuitRosterEntry) => void;
}) {
  const { view } = props;
  const isMobile = useMediaQuery(`(max-width: ${FO_BP_MOBILE_MAX_PX}px)`);
  const coarse = useMediaQuery("(pointer: coarse)");
  const [card, setCard] = useState<CircuitRosterPick | null>(null);
  const panelShown =
    view.state === "ready" &&
    view.writable &&
    props.picker !== null &&
    view.freeAgencyNote === null;
  useHashFocus("add", CIRCUIT_FREE_AGENCY_HEADING_ID, panelShown);

  if (view.state === "loading") return <CircuitPageSkeleton label="Loading roster" />;
  if (view.state === "error") {
    return (
      <CircuitPageError
        title="Roster"
        notFound={view.notFound}
        message={view.message}
        requestId={view.requestId}
      />
    );
  }

  const { detail, roster, own, writable, freeAgencyNote } = view;
  const link = {
    leagueId: detail.league.id,
    leagueName: detail.league.name,
    circuitLeagueId: detail.circuit_league.id
  };
  const selectedMember = props.memberUserId ?? props.viewerUserId;
  const phoneCard = Boolean(isMobile || coarse);
  const chosenDrop =
    roster?.entries.find((e) => e.selection.id === props.dropSelectionId)?.selection ??
    null;
  const chosenMember = detail.members.find((m) => m.user_id === selectedMember) ?? null;
  const title = own ? "Your roster" : `${roster?.member.username ?? "Player"}'s roster`;

  return (
    <CircuitPageFrame
      title={title}
      subtitle={`${detail.circuit?.name ?? "Season"} · ${detail.league.name}`}
      actions={
        <>
          <Button component={Link} to={circuitTransactionsPath(link)} variant="outline">
            Transactions
          </Button>
          {circuitWaiversVisible(detail.circuit_league.status) ? (
            <Button component={Link} to={circuitWaiversPath(link)} variant="outline">
              Waivers
            </Button>
          ) : null}
          <Button component={Link} to={circuitLeaguePath(link)} variant="outline">
            Back to season
          </Button>
        </>
      }
    >
      {detail.members.length > 0 ? (
        <Box maw="var(--fo-layout-fieldBasis-lg)">
          <Select
            label="Player"
            data={detail.members.map((m) => ({
              value: String(m.user_id),
              label: m.username
            }))}
            renderOption={({ option }) => {
              const member = detail.members.find(
                (m) => String(m.user_id) === option.value
              );
              return (
                <PlayerName
                  name={option.label}
                  avatarKey={member?.avatar_key ?? null}
                  isViewer={member?.user_id === props.viewerUserId}
                />
              );
            }}
            leftSection={
              chosenMember ? (
                <AnimalAvatarIcon avatarKey={chosenMember.avatar_key} size="sm" />
              ) : null
            }
            value={selectedMember === null ? null : String(selectedMember)}
            placeholder="Choose a player"
            onChange={(v) => {
              const id = v ? Number(v) : null;
              props.onSelectMember(id === props.viewerUserId ? null : id);
            }}
            allowDeselect={false}
          />
        </Box>
      ) : null}

      {roster === null ? (
        <Text className="baseline-textBody">
          You have not joined this season, so you have no roster. Choose a player to see
          theirs.
        </Text>
      ) : (
        <Box className="baseline-grid2Wide">
          <CircuitRosterList
            roster={roster}
            categories={detail.categories}
            canDrop={writable}
            droppingSelectionId={props.droppingSelectionId}
            dropStatus={props.dropStatus}
            onDrop={props.onDrop}
            onOpenCard={phoneCard ? setCard : undefined}
          />
          {writable && props.picker ? (
            <CircuitFreeAgentPanel
              closedNote={freeAgencyNote}
              picker={withContenderPreview({
                picker: props.picker,
                categories: detail.categories,
                viewerUserId: props.viewerUserId,
                drop: chosenDrop,
                busy: props.adding
              })}
              dropOptions={props.dropOptions}
              dropSelectionId={props.dropSelectionId}
              dropPlaceholder={circuitDropPlaceholder(
                roster,
                props.pending?.circuit_category_id ?? props.picker.category?.id ?? null
              )}
              pending={props.pending}
              adding={props.adding}
              status={props.addStatus}
              onChooseDrop={props.onChooseDrop}
              onRetry={props.onRetryAdd}
              onCancel={props.onCancelAdd}
            />
          ) : own ? (
            <Stack gap="sm">
              <Text className="baseline-textBody">
                Rosters change only while the season is in progress.
              </Text>
            </Stack>
          ) : null}
        </Box>
      )}
      <ContenderCardModal
        card={
          card
            ? {
                tooltip: card.view.tooltip,
                pointsSection: card.pill.pointsSection,
                actions: writable
                  ? [
                      {
                        key: "drop",
                        label: "Drop",
                        danger: true,
                        onClick: () => {
                          setCard(null);
                          props.onDrop(card.entry);
                        }
                      }
                    ]
                  : []
              }
            : null
        }
        onClose={() => setCard(null)}
      />
    </CircuitPageFrame>
  );
}
