import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "../lib/api";
import { confirm, notify } from "../notifications";
import type {
  ApiResult,
  CircuitDraftPickResult,
  CircuitDraftSnapshot,
  CircuitLeagueDetail,
  CircuitQueue,
  CircuitSelectionSummary
} from "../lib/types";
import { circuitSelectionLabel } from "../decisions/circuitRoster";
import {
  circuitDraftClock,
  circuitDraftErrorMessage,
  circuitDraftPhase,
  circuitPickGate,
  circuitQueueRows,
  circuitSelectionDrafted,
  circuitTurnAnnouncement,
  type CircuitDraftPhase,
  type CircuitPickGate,
  type CircuitQueueRow
} from "../decisions/circuitDraft";
import { circuitStagedRows } from "../decisions/circuitDraftRoom";
import { describeConnection, nextConnectionState } from "../decisions/draft/connection";
import { estimateServerOffsetMs } from "../decisions/draft/clockSkew";
import { makeRequestId } from "./draft/helpers";
import { useDraftClock } from "./draft/useDraftClock";
import { useCircuitDraftSocket } from "./useCircuitDraftSocket";
import { errorCode, errorMessage, errorRequestId, unwrap } from "./query/errors";
import { queryKeys } from "./query/keys";
import {
  circuitDraftQuery,
  circuitLeagueQuery,
  circuitQueueQuery
} from "./query/queries";

/*
 * The draft of a league's season: the lobby until the commissioner starts it,
 * then the board from the snapshot, kept live by useCircuitDraftSocket. The
 * viewer's queue and staged contenders sit beside both and can change at any
 * time. Every queue or staging write returns both lists, which replace the
 * cached read; a reorder shows its new order while it saves. The member on
 * the clock picks through the contender picker or from the queue and staged
 * lists; the commissioner pauses and resumes.
 */

export type CircuitDraftView =
  | { state: "loading" }
  | { state: "error"; message: string; requestId?: string; notFound: boolean }
  | {
      state: "ready";
      detail: CircuitLeagueDetail;
      phase: CircuitDraftPhase;
      /** Null in the lobby. */
      snapshot: CircuitDraftSnapshot | null;
      /** The viewer's queue; null when they have not joined the season. */
      queue: CircuitQueueRow[] | null;
      /** The viewer's staged contenders; null when they have not joined the season. */
      staged: CircuitQueueRow[] | null;
      canStart: boolean;
      /** Whether the viewer may pick now, and why not; null for non-members or no draft. */
      gate: CircuitPickGate | null;
      /** The commissioner may pause or resume. */
      canPause: boolean;
      /** For the live region: whose pick it is. */
      announcement: string;
    };

function success(id: string, message: string) {
  notify({
    id,
    severity: "success",
    trigger_type: "user_action",
    scope: "local",
    durability: "ephemeral",
    requires_decision: false,
    message
  });
}

function failure(err: unknown, fallback: string): ApiResult {
  return {
    ok: false,
    message: circuitDraftErrorMessage(
      { errorCode: errorCode(err), message: errorMessage(err, "") },
      fallback
    ),
    requestId: errorRequestId(err)
  };
}

export function useCircuitDraftOrchestration(input: {
  circuitLeagueId: number;
  viewerUserId: number | null;
}) {
  const { circuitLeagueId, viewerUserId } = input;
  const queryClient = useQueryClient();
  const valid = Number.isInteger(circuitLeagueId) && circuitLeagueId > 0;
  const detailQuery = useQuery({
    ...circuitLeagueQuery(circuitLeagueId),
    enabled: valid
  });
  const draftQuery = useQuery({ ...circuitDraftQuery(circuitLeagueId), enabled: valid });
  const detail = detailQuery.data;
  const isMember = detail?.viewer.is_member ?? false;
  const queueQuery = useQuery({
    ...circuitQueueQuery(circuitLeagueId),
    enabled: valid && isMember
  });
  const snapshot = draftQuery.data;
  const draftId = snapshot?.draft.id ?? null;
  const [connectionState, dispatchConnection] = useReducer(nextConnectionState, "idle");
  const connection = describeConnection(connectionState);

  useCircuitDraftSocket({
    circuitLeagueId,
    enabled: valid && isMember && snapshot?.draft.status !== "COMPLETED",
    onConnectionEvent: dispatchConnection
  });

  // The snapshot and each applied event carry the server's time; the gap to
  // when they arrived corrects the countdown for a skewed local clock.
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const serverTime = snapshot?.server_time;
  const receivedAt = draftQuery.dataUpdatedAt;
  useEffect(() => {
    const offset = estimateServerOffsetMs({ serverTime, receivedAtMs: receivedAt });
    if (offset !== null) setServerOffsetMs(offset);
  }, [serverTime, receivedAt]);
  const serverNowMs = useDraftClock(serverOffsetMs);

  const [queueStatus, setQueueStatus] = useState<ApiResult | null>(null);
  const [startStatus, setStartStatus] = useState<ApiResult | null>(null);
  const [pickStatus, setPickStatus] = useState<ApiResult | null>(null);
  const [pauseStatus, setPauseStatus] = useState<ApiResult | null>(null);
  // The order shown while a reorder saves, so the row does not jump back.
  const [pendingOrder, setPendingOrder] = useState<number[] | null>(null);

  const applyQueue = useCallback(
    (next: CircuitQueue | undefined) => {
      if (next)
        queryClient.setQueryData(queryKeys.circuitLeagues.queue(circuitLeagueId), next);
    },
    [queryClient, circuitLeagueId]
  );

  const send = useCallback(
    async (method: string, path: string, body: unknown, fallback: string) =>
      unwrap(
        await fetchJson<CircuitQueue>(
          `/circuit-leagues/${circuitLeagueId}/queue${path}`,
          {
            method,
            ...(body === undefined
              ? {}
              : {
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body)
                })
          }
        ),
        fallback
      ),
    [circuitLeagueId]
  );

  const addMutation = useMutation({
    mutationFn: (selectionId: number) =>
      send("POST", "", { selection_id: selectionId }, "Could not queue that contender"),
    onSuccess: applyQueue
  });
  const removeMutation = useMutation({
    mutationFn: (selectionId: number) =>
      send("DELETE", `/${selectionId}`, undefined, "Could not remove that contender"),
    onSuccess: applyQueue
  });
  const stageMutation = useMutation({
    mutationFn: (selectionId: number) =>
      send(
        "POST",
        "/staged",
        { selection_id: selectionId },
        "Could not stage that contender"
      ),
    onSuccess: applyQueue
  });
  const unstageMutation = useMutation({
    mutationFn: (selectionId: number) =>
      send(
        "DELETE",
        `/staged/${selectionId}`,
        undefined,
        "Could not remove that contender"
      ),
    onSuccess: applyQueue
  });
  const reorderMutation = useMutation({
    mutationFn: (selectionIds: number[]) =>
      send("PUT", "", { selection_ids: selectionIds }, "Could not reorder your queue"),
    onSuccess: applyQueue
  });
  const startMutation = useMutation({
    mutationFn: async () =>
      unwrap(
        await fetchJson<unknown>(`/circuit-leagues/${circuitLeagueId}/draft`, {
          method: "POST"
        }),
        "Could not start the draft"
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.circuitLeagues.draft(circuitLeagueId)
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.circuitLeagues.detail(circuitLeagueId)
      });
    }
  });

  const queueWriteFailed = useCallback(
    (err: unknown, fallback: string) => {
      setQueueStatus(failure(err, fallback));
      // Another window changed the queue: show what the server holds now.
      if (errorCode(err) === "CIRCUIT_QUEUE_CHANGED") {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.circuitLeagues.queue(circuitLeagueId)
        });
      }
    },
    [queryClient, circuitLeagueId]
  );

  /** Queues a contender at the bottom; true once it is queued. */
  const addToQueue = useCallback(
    async (selection: CircuitSelectionSummary): Promise<boolean> => {
      setQueueStatus(null);
      try {
        await addMutation.mutateAsync(selection.id);
      } catch (err) {
        queueWriteFailed(err, "Could not queue that contender");
        return false;
      }
      success("circuitDraft.queue.add", `Queued ${circuitSelectionLabel(selection)}`);
      return true;
    },
    [addMutation, queueWriteFailed]
  );

  /** Stages a contender, taking it out of the queue if queued; true once staged. */
  const stageSelection = useCallback(
    async (selection: CircuitSelectionSummary): Promise<boolean> => {
      setQueueStatus(null);
      try {
        await stageMutation.mutateAsync(selection.id);
      } catch (err) {
        queueWriteFailed(err, "Could not stage that contender");
        return false;
      }
      success("circuitDraft.queue.stage", `Staged ${circuitSelectionLabel(selection)}`);
      return true;
    },
    [stageMutation, queueWriteFailed]
  );

  const unstage = useCallback(
    async (selectionId: number) => {
      setQueueStatus(null);
      try {
        await unstageMutation.mutateAsync(selectionId);
      } catch (err) {
        queueWriteFailed(err, "Could not remove that contender");
      }
    },
    [unstageMutation, queueWriteFailed]
  );

  const removeFromQueue = useCallback(
    async (selectionId: number) => {
      setQueueStatus(null);
      try {
        await removeMutation.mutateAsync(selectionId);
      } catch (err) {
        queueWriteFailed(err, "Could not remove that contender");
      }
    },
    [removeMutation, queueWriteFailed]
  );

  const reorderQueue = useCallback(
    async (selectionIds: number[]) => {
      setQueueStatus(null);
      setPendingOrder(selectionIds);
      try {
        await reorderMutation.mutateAsync(selectionIds);
      } catch (err) {
        queueWriteFailed(err, "Could not reorder your queue");
      } finally {
        setPendingOrder(null);
      }
    },
    [reorderMutation, queueWriteFailed]
  );

  const refreshDraft = useCallback(
    () =>
      void queryClient.invalidateQueries({
        queryKey: queryKeys.circuitLeagues.draft(circuitLeagueId)
      }),
    [queryClient, circuitLeagueId]
  );

  const pickMutation = useMutation({
    mutationFn: async (selectionId: number) =>
      unwrap(
        await fetchJson<CircuitDraftPickResult>(`/circuit-drafts/${draftId}/picks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selection_id: selectionId, request_id: makeRequestId() })
        }),
        "Could not make that pick"
      ),
    // The socket brings the pick to everyone; this covers a slow or lost one.
    onSettled: refreshDraft
  });
  const pauseMutation = useMutation({
    mutationFn: async (action: "pause" | "resume") =>
      unwrap(
        await fetchJson<unknown>(`/circuit-drafts/${draftId}/${action}`, {
          method: "POST"
        }),
        action === "pause" ? "Could not pause the draft" : "Could not resume the draft"
      ),
    onSettled: refreshDraft
  });

  /** Drafts a contender for the viewer's slot on the clock; true once drafted. */
  const draftSelection = useCallback(
    async (selection: CircuitSelectionSummary): Promise<boolean> => {
      setPickStatus(null);
      if (!snapshot || draftId === null) return false;
      if (circuitSelectionDrafted(snapshot, selection.id)) {
        setPickStatus({
          ok: false,
          message: circuitDraftErrorMessage(
            { errorCode: "CIRCUIT_SELECTION_TAKEN" },
            "Could not make that pick"
          )
        });
        return false;
      }
      try {
        await pickMutation.mutateAsync(selection.id);
      } catch (err) {
        setPickStatus(failure(err, "Could not make that pick"));
        return false;
      }
      success("circuitDraft.pick", `Drafted ${circuitSelectionLabel(selection)}`);
      return true;
    },
    [snapshot, draftId, pickMutation]
  );

  const togglePause = useCallback(async () => {
    if (!snapshot) return;
    const action = snapshot.draft.status === "PAUSED" ? "resume" : "pause";
    setPauseStatus(null);
    try {
      await pauseMutation.mutateAsync(action);
    } catch (err) {
      setPauseStatus(
        failure(
          err,
          action === "pause" ? "Could not pause the draft" : "Could not resume the draft"
        )
      );
    }
  }, [snapshot, pauseMutation]);

  const startDraft = useCallback(async () => {
    const ok = await confirm({
      title: "Start the draft?",
      message:
        "The draft order is drawn at random and the first pick goes on the clock at once.",
      confirmLabel: "Start draft"
    });
    if (!ok) return;
    setStartStatus(null);
    try {
      await startMutation.mutateAsync();
    } catch (err) {
      setStartStatus(failure(err, "Could not start the draft"));
      return;
    }
    success("circuitDraft.start", "The draft has started");
  }, [startMutation]);

  const queue = queueQuery.data;
  const view = useMemo<CircuitDraftView>(() => {
    if (!valid) return { state: "error", message: "Season not found", notFound: true };
    const failed = detailQuery.isError
      ? detailQuery.error
      : draftQuery.isError
        ? draftQuery.error
        : queueQuery.isError
          ? queueQuery.error
          : null;
    if (failed) {
      const code = errorCode(failed);
      return {
        state: "error",
        message: errorMessage(failed, "Unable to load the draft"),
        requestId: errorRequestId(failed),
        notFound: code === "NOT_FOUND" || code === "LEAGUE_NOT_FOUND"
      };
    }
    if (!detail || snapshot === undefined || (isMember && !queue)) {
      return { state: "loading" };
    }
    let rows = queue ? circuitQueueRows(queue, detail.categories, snapshot) : null;
    if (rows && pendingOrder) {
      const byId = new Map(rows.map((r) => [r.selection.id, r]));
      rows = pendingOrder.flatMap((id) => {
        const row = byId.get(id);
        return row ? [row] : [];
      });
    }
    const phase = circuitDraftPhase(snapshot);
    return {
      state: "ready",
      detail,
      phase,
      snapshot,
      queue: rows,
      staged: queue ? circuitStagedRows(queue, detail.categories, snapshot) : null,
      canStart:
        snapshot === null &&
        detail.viewer.can_manage &&
        detail.circuit_league.status === "INITIALIZED",
      gate:
        snapshot && isMember
          ? circuitPickGate({
              snapshot,
              viewerUserId,
              connectionBlockedReason: connection.pickBlockedReason
            })
          : null,
      canPause: detail.viewer.can_manage && (phase === "live" || phase === "paused"),
      announcement: circuitTurnAnnouncement(snapshot, viewerUserId)
    };
  }, [
    valid,
    viewerUserId,
    connection.pickBlockedReason,
    detail,
    snapshot,
    queue,
    isMember,
    pendingOrder,
    detailQuery.isError,
    detailQuery.error,
    draftQuery.isError,
    draftQuery.error,
    queueQuery.isError,
    queueQuery.error
  ]);

  return {
    view,
    queueStatus,
    startStatus,
    queueBusy:
      addMutation.isPending ||
      removeMutation.isPending ||
      stageMutation.isPending ||
      unstageMutation.isPending ||
      pendingOrder !== null,
    removingSelectionId: removeMutation.isPending
      ? (removeMutation.variables ?? null)
      : unstageMutation.isPending
        ? (unstageMutation.variables ?? null)
        : null,
    starting: startMutation.isPending,
    connection,
    connectionState,
    clock: snapshot ? circuitDraftClock(snapshot, serverNowMs) : null,
    pickStatus,
    picking: pickMutation.isPending,
    pauseStatus,
    pausing: pauseMutation.isPending,
    draftSelection,
    togglePause: () => void togglePause(),
    addToQueue,
    stageSelection,
    unstage: (selectionId: number) => void unstage(selectionId),
    removeFromQueue: (selectionId: number) => void removeFromQueue(selectionId),
    reorderQueue: (selectionIds: number[]) => void reorderQueue(selectionIds),
    startDraft: () => void startDraft()
  };
}

export type CircuitDraftOrchestration = ReturnType<typeof useCircuitDraftOrchestration>;
