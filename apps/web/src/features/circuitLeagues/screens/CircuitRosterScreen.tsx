import { Link } from "react-router-dom";
import { Box, Button, Select, Stack, Text } from "@ui";
import type { ContenderPickerProps } from "@/features/contenders/ui/ContenderPicker";
import type { CircuitRosterView } from "@/orchestration/circuitRoster";
import type { CircuitRosterEntry } from "@/decisions/circuitRoster";
import type { ApiResult, CircuitSelectionSummary } from "@/lib/types";
import { circuitLeaguePath, circuitTransactionsPath } from "@/lib/routes";
import {
  CircuitPageError,
  CircuitPageFrame,
  CircuitPageSkeleton
} from "@/features/circuitLeagues/ui/CircuitPageFrame";
import { CircuitRosterList } from "@/features/circuitLeagues/ui/CircuitRosterList";
import { CircuitFreeAgentPanel } from "@/features/circuitLeagues/ui/CircuitFreeAgentPanel";

export function CircuitRosterScreen(props: {
  view: CircuitRosterView;
  /** Whose roster the member select shows; null is the viewer's own. */
  memberUserId: number | null;
  viewerUserId: number | null;
  /** The contender picker, once the season is known. */
  picker: ContenderPickerProps | null;
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
              label: m.user_id === props.viewerUserId ? `${m.username} (you)` : m.username
            }))}
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
            canDrop={writable}
            droppingSelectionId={props.droppingSelectionId}
            dropStatus={props.dropStatus}
            onDrop={props.onDrop}
          />
          {writable && props.picker ? (
            <CircuitFreeAgentPanel
              closedNote={freeAgencyNote}
              picker={props.picker}
              dropOptions={props.dropOptions}
              dropSelectionId={props.dropSelectionId}
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
    </CircuitPageFrame>
  );
}
