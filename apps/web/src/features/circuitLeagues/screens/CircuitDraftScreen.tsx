import { useState } from "react";
import { Link } from "react-router-dom";
import { Box, Button, Group, Stack, Text } from "@ui";
import type { ContenderPickerProps } from "@/features/contenders/ui/ContenderPicker";
import type { CircuitDraftView } from "@/orchestration/circuitDraft";
import {
  circuitBoardByCategory,
  circuitBoardBySeat,
  circuitDraftLobbyFacts,
  circuitDraftRoundNote,
  circuitDraftStartNote,
  circuitDraftStatusLabel,
  circuitOnTheClockLabel,
  type CircuitDraftClockView
} from "@/decisions/circuitDraft";
import type {
  DraftConnectionState,
  DraftConnectionView
} from "@/decisions/draft/connection";
import { circuitLeagueStatusLabel } from "@/decisions/circuitLeague";
import { circuitRostersVisible } from "@/decisions/circuitRoster";
import {
  fullSeasonSettingsFrom,
  SETTINGS_AREA_TITLES
} from "@/decisions/fullSeasonSettings";
import { areaSummary } from "@/decisions/fullSeasonSummary";
import { statusTone } from "@/decisions/statusTone";
import type { ApiResult } from "@/lib/types";
import { circuitLeaguePath, circuitRosterPath } from "@/lib/routes";
import { StatusPill } from "@/shared/pills";
import {
  CircuitPageError,
  CircuitPageFrame,
  CircuitPageSkeleton
} from "@/features/circuitLeagues/ui/CircuitPageFrame";
import {
  CircuitDraftBoard,
  type CircuitBoardMode
} from "@/features/circuitLeagues/ui/CircuitDraftBoard";
import { CircuitDraftLobby } from "@/features/circuitLeagues/ui/CircuitDraftLobby";
import { CircuitQueueEditor } from "@/features/circuitLeagues/ui/CircuitQueueEditor";
import { CircuitDraftPickPanel } from "@/features/circuitLeagues/ui/CircuitDraftPickPanel";
import { CircuitDraftTurnBar } from "@/features/circuitLeagues/ui/CircuitDraftTurnBar";
import { DraftConnectionIndicator } from "@/features/draft/ui/DraftConnectionIndicator";
import { DraftLiveRegion } from "@/features/draft/ui/DraftLiveRegion";

export function CircuitDraftScreen(props: {
  view: CircuitDraftView;
  viewerUserId: number | null;
  /** The contender picker for queue adds, once the season is known. */
  picker: ContenderPickerProps | null;
  /** The contender picker for the viewer's own picks, while the draft runs. */
  draftPicker: ContenderPickerProps | null;
  connection: DraftConnectionView;
  connectionState: DraftConnectionState;
  clock: CircuitDraftClockView | null;
  pickStatus: ApiResult | null;
  pausing: boolean;
  pauseStatus: ApiResult | null;
  onTogglePause: () => void;
  queueBusy: boolean;
  removingSelectionId: number | null;
  queueStatus: ApiResult | null;
  starting: boolean;
  startStatus: ApiResult | null;
  onRemoveFromQueue: (selectionId: number) => void;
  onReorderQueue: (selectionIds: number[]) => void;
  onStart: () => void;
}) {
  const { view } = props;
  const [boardMode, setBoardMode] = useState<CircuitBoardMode>("player");
  if (view.state === "loading") return <CircuitPageSkeleton label="Loading draft" />;
  if (view.state === "error") {
    return (
      <CircuitPageError
        title="Draft"
        notFound={view.notFound}
        message={view.message}
        requestId={view.requestId}
      />
    );
  }

  const { detail, snapshot, queue, phase } = view;
  const link = {
    leagueId: detail.league.id,
    leagueName: detail.league.name,
    circuitLeagueId: detail.circuit_league.id
  };
  const statusLabel = snapshot
    ? circuitDraftStatusLabel(snapshot.draft.status)
    : circuitLeagueStatusLabel(detail.circuit_league.status);
  const onTheClock = snapshot ? circuitOnTheClockLabel(snapshot) : null;

  const queuePanel = queue ? (
    <CircuitQueueEditor
      rows={queue}
      autoDraft={detail.circuit_league.auto_draft_enabled}
      busy={props.queueBusy}
      removingSelectionId={props.removingSelectionId}
      status={props.queueStatus}
      picker={props.picker ? { ...props.picker, confirmVerb: "Queue" } : null}
      onRemove={props.onRemoveFromQueue}
      onReorder={props.onReorderQueue}
    />
  ) : (
    <Text className="baseline-textBody">
      You have not joined this season, so you have no draft queue.
    </Text>
  );

  const board = snapshot ? (
    <CircuitDraftBoard
      mode={boardMode}
      onModeChange={setBoardMode}
      seats={circuitBoardBySeat(snapshot, detail.categories, props.viewerUserId)}
      categories={circuitBoardByCategory(snapshot, detail.categories)}
    />
  ) : null;

  return (
    <CircuitPageFrame
      title={phase === "lobby" ? "Draft lobby" : "Draft room"}
      subtitle={
        <Group component="span" gap="sm" wrap="wrap">
          <Text component="span" className="baseline-textBody baseline-wrapAnywhere">
            {`${detail.circuit?.name ?? "Season"} · ${detail.league.name}`}
          </Text>
          <StatusPill {...statusTone(statusLabel)}>{statusLabel}</StatusPill>
        </Group>
      }
      actions={
        <>
          {circuitRostersVisible(detail.circuit_league.status) &&
          detail.viewer.is_member ? (
            <Button component={Link} to={circuitRosterPath(link)} variant="outline">
              Your roster
            </Button>
          ) : null}
          <Button component={Link} to={circuitLeaguePath(link)} variant="outline">
            Back to season
          </Button>
        </>
      }
    >
      {snapshot === null ? (
        <Box className="baseline-grid2Wide">
          <CircuitDraftLobby
            startNote={circuitDraftStartNote({
              status: detail.circuit_league.status,
              canManage: detail.viewer.can_manage
            })}
            facts={circuitDraftLobbyFacts(detail.circuit_league)}
            summaries={(["events", "scoring", "roster"] as const).map((area) => ({
              title: SETTINGS_AREA_TITLES[area],
              ...areaSummary(
                area,
                fullSeasonSettingsFrom(detail),
                detail.events,
                detail.categories
              )
            }))}
            members={detail.members.map((m) => ({
              userId: m.user_id,
              username: m.username,
              isViewer: m.user_id === props.viewerUserId
            }))}
            canStart={view.canStart}
            starting={props.starting}
            startStatus={props.startStatus}
            onStart={props.onStart}
          />
          {queuePanel}
        </Box>
      ) : (
        <Stack gap="md">
          {phase === "completed" ? (
            <Text className="baseline-textBody" role="status">
              The draft is complete. Rosters now change through waivers and free agency.
            </Text>
          ) : (
            <CircuitDraftTurnBar
              headline={onTheClock ? `On the clock: ${onTheClock}` : statusLabel}
              clockLabel={props.clock?.label ?? null}
              urgent={props.clock?.urgent ?? false}
              viewerOnTheClock={view.gate?.onTheClock ?? false}
              roundNote={circuitDraftRoundNote(snapshot)}
              autoDraftNote={
                view.gate?.onTheClock && detail.circuit_league.auto_draft_enabled
                  ? "If your clock runs out, your highest queued contender still available is drafted for you."
                  : null
              }
              paused={phase === "paused"}
              canPause={view.canPause}
              pausing={props.pausing}
              pauseStatus={props.pauseStatus}
              onTogglePause={props.onTogglePause}
            />
          )}
          {/* Once the draft is over the queue has nothing left to do. */}
          {phase === "completed" ? (
            board
          ) : (
            // Reading order (and the phone's order): the pick, the board, the
            // queue. From 501 px the pick and queue share the narrow column.
            <Box className={["baseline-grid2Wide", "circuit-draftRoom"].join(" ")}>
              {view.gate ? (
                <Box className="circuit-draftPick">
                  <CircuitDraftPickPanel
                    canPick={view.gate.canPick}
                    reason={view.gate.reason}
                    status={props.pickStatus}
                    picker={props.draftPicker}
                  />
                </Box>
              ) : null}
              <Box className="circuit-draftBoardCol">{board}</Box>
              <Box className="circuit-draftQueue">{queuePanel}</Box>
            </Box>
          )}
        </Stack>
      )}
      <DraftLiveRegion
        message={view.announcement}
        connectionState={props.connectionState}
      />
      <DraftConnectionIndicator connection={props.connection} />
    </CircuitPageFrame>
  );
}
