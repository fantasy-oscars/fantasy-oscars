import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "../lib/api";
import { confirm, notify } from "../notifications";
import type {
  ApiResult,
  CircuitLeagueDetail,
  CircuitRoster,
  CircuitSelectionSummary,
  CircuitTransaction
} from "../lib/types";
import {
  circuitAddBlockedReason,
  circuitDropOptions,
  circuitFreeAgencyNote,
  circuitRosterErrorMessage,
  circuitRosterWritable,
  circuitSelectionLabel,
  type CircuitRosterEntry
} from "../decisions/circuitRoster";
import { errorCode, errorMessage, errorRequestId, unwrap } from "./query/errors";
import { queryKeys } from "./query/keys";
import {
  circuitLeagueQuery,
  circuitRosterQuery,
  circuitTransactionsQuery
} from "./query/queries";

/*
 * Rosters and the transaction log of a league's season in a Circuit. The
 * viewer manages only their own roster: drops at any time in season, and
 * free-agent adds (with an optional drop) while no waiver window is open.
 * Every roster write returns the roster, which replaces the cached read.
 */

type LoadError = {
  state: "error";
  message: string;
  requestId?: string;
  notFound: boolean;
};

export type CircuitRosterView =
  | { state: "loading" }
  | LoadError
  | {
      state: "ready";
      detail: CircuitLeagueDetail;
      /** Null when the viewer asked for their own roster without having joined. */
      roster: CircuitRoster | null;
      /** The roster shown is the viewer's own, so it can change here. */
      own: boolean;
      writable: boolean;
      freeAgencyNote: string | null;
    };

export type CircuitTransactionsView =
  | { state: "loading" }
  | LoadError
  | { state: "ready"; detail: CircuitLeagueDetail; transactions: CircuitTransaction[] };

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

function loadError(err: unknown, fallback: string): LoadError {
  const code = errorCode(err);
  return {
    state: "error",
    message: errorMessage(err, fallback),
    requestId: errorRequestId(err),
    notFound: code === "NOT_FOUND" || code === "LEAGUE_NOT_FOUND"
  };
}

function failure(err: unknown, fallback: string): ApiResult {
  return {
    ok: false,
    message: circuitRosterErrorMessage(
      { errorCode: errorCode(err), message: errorMessage(err, "") },
      fallback
    ),
    requestId: errorRequestId(err)
  };
}

export function useCircuitRosterOrchestration(input: {
  circuitLeagueId: number;
  /** Whose roster to show; null (or the viewer's own id) shows the viewer's. */
  memberUserId: number | null;
  viewerUserId: number | null;
}) {
  const { circuitLeagueId, viewerUserId } = input;
  const memberUserId =
    input.memberUserId !== null && input.memberUserId === viewerUserId
      ? null
      : input.memberUserId;
  const own = memberUserId === null;
  const queryClient = useQueryClient();
  const valid = Number.isInteger(circuitLeagueId) && circuitLeagueId > 0;
  const detailQuery = useQuery({
    ...circuitLeagueQuery(circuitLeagueId),
    enabled: valid
  });
  const rosterQuery = useQuery({
    ...circuitRosterQuery(circuitLeagueId, memberUserId),
    enabled: valid
  });
  const detail = detailQuery.data;
  const roster = rosterQuery.data;
  const notJoined = own && errorCode(rosterQuery.error) === "CIRCUIT_MEMBERSHIP_REQUIRED";

  const [pending, setPending] = useState<CircuitSelectionSummary | null>(null);
  const [dropSelectionId, setDropSelectionId] = useState<number | null>(null);
  const [addStatus, setAddStatus] = useState<ApiResult | null>(null);
  const [dropStatus, setDropStatus] = useState<ApiResult | null>(null);

  const apply = useCallback(
    (next: CircuitRoster | undefined) => {
      if (!next) return;
      queryClient.setQueryData(
        queryKeys.circuitLeagues.roster(circuitLeagueId, null),
        next
      );
      void queryClient.invalidateQueries({
        queryKey: queryKeys.circuitLeagues.transactions(circuitLeagueId)
      });
    },
    [queryClient, circuitLeagueId]
  );

  const post = useCallback(
    async (path: string, body: unknown, fallback: string) =>
      unwrap(
        await fetchJson<CircuitRoster>(`/circuit-leagues/${circuitLeagueId}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }),
        fallback
      ),
    [circuitLeagueId]
  );

  const addMutation = useMutation({
    mutationFn: (vars: { selectionId: number; dropSelectionId: number | null }) =>
      post(
        "/free-agents",
        {
          selection_id: vars.selectionId,
          ...(vars.dropSelectionId === null
            ? {}
            : { drop_selection_id: vars.dropSelectionId })
        },
        "Could not add that pick"
      ),
    onSuccess: apply
  });

  const dropMutation = useMutation({
    mutationFn: (selectionId: number) =>
      post("/drops", { selection_id: selectionId }, "Could not drop that pick"),
    onSuccess: apply
  });

  const view = useMemo<CircuitRosterView>(() => {
    if (!valid) return { state: "error", message: "Season not found", notFound: true };
    if (detailQuery.isError) return loadError(detailQuery.error, "Unable to load season");
    if (rosterQuery.isError && !notJoined) {
      return loadError(rosterQuery.error, "Unable to load roster");
    }
    if (!detail || (!roster && !notJoined)) return { state: "loading" };
    const shown = notJoined ? null : (roster ?? null);
    return {
      state: "ready",
      detail,
      roster: shown,
      own,
      writable: own && shown !== null && circuitRosterWritable(shown.status),
      freeAgencyNote: shown ? circuitFreeAgencyNote(shown.free_agency) : null
    };
  }, [
    valid,
    detail,
    roster,
    own,
    notJoined,
    detailQuery.isError,
    detailQuery.error,
    rosterQuery.isError,
    rosterQuery.error
  ]);

  /** Adds `selection` as a free agent with the chosen drop; true once added. */
  const addFreeAgent = useCallback(
    async (selection: CircuitSelectionSummary): Promise<boolean> => {
      if (!roster || !own) return false;
      setPending(selection);
      setAddStatus(null);
      const blocked = circuitAddBlockedReason(roster, selection, dropSelectionId);
      if (blocked) {
        setAddStatus({ ok: false, message: blocked });
        return false;
      }
      const dropped =
        roster.entries.find((e) => e.selection.id === dropSelectionId)?.selection ?? null;
      try {
        await addMutation.mutateAsync({ selectionId: selection.id, dropSelectionId });
      } catch (err) {
        setAddStatus(failure(err, "Could not add that pick"));
        return false;
      }
      setPending(null);
      setDropSelectionId(null);
      setDropStatus(null);
      success(
        "circuitRoster.add.success",
        dropped
          ? `Added ${circuitSelectionLabel(selection)} and dropped ${circuitSelectionLabel(dropped)}`
          : `Added ${circuitSelectionLabel(selection)}`
      );
      return true;
    },
    [roster, own, dropSelectionId, addMutation]
  );

  const retryPending = useCallback(
    async () => (pending ? addFreeAgent(pending) : false),
    [pending, addFreeAgent]
  );

  const cancelPending = useCallback(() => {
    setPending(null);
    setAddStatus(null);
  }, []);

  const chooseDrop = useCallback((selectionId: number | null) => {
    setDropSelectionId(selectionId);
    setAddStatus(null);
  }, []);

  const drop = useCallback(
    async (entry: CircuitRosterEntry) => {
      if (!own) return;
      const label = circuitSelectionLabel(entry.selection);
      const ok = await confirm({
        title: `Drop ${label}?`,
        message: `${label} becomes a free agent at once. Anyone can add them, including you.`,
        confirmLabel: "Drop",
        danger: true
      });
      if (!ok) return;
      setDropStatus(null);
      try {
        await dropMutation.mutateAsync(entry.selection.id);
      } catch (err) {
        setDropStatus(failure(err, "Could not drop that pick"));
        return;
      }
      if (dropSelectionId === entry.selection.id) setDropSelectionId(null);
      success("circuitRoster.drop.success", `Dropped ${label}`);
    },
    [own, dropMutation, dropSelectionId]
  );

  return {
    view,
    pending,
    dropSelectionId,
    dropOptions: roster && own ? circuitDropOptions(roster, pending) : [],
    adding: addMutation.isPending,
    droppingSelectionId: dropMutation.isPending ? (dropMutation.variables ?? null) : null,
    addStatus,
    dropStatus,
    addFreeAgent,
    retryPending,
    cancelPending,
    chooseDrop,
    drop: (entry: CircuitRosterEntry) => void drop(entry)
  };
}

export type CircuitRosterOrchestration = ReturnType<typeof useCircuitRosterOrchestration>;

export function useCircuitTransactionsOrchestration(input: { circuitLeagueId: number }) {
  const { circuitLeagueId } = input;
  const valid = Number.isInteger(circuitLeagueId) && circuitLeagueId > 0;
  const detailQuery = useQuery({
    ...circuitLeagueQuery(circuitLeagueId),
    enabled: valid
  });
  const logQuery = useQuery({
    ...circuitTransactionsQuery(circuitLeagueId),
    enabled: valid
  });

  const view = useMemo<CircuitTransactionsView>(() => {
    if (!valid) return { state: "error", message: "Season not found", notFound: true };
    if (detailQuery.isError) return loadError(detailQuery.error, "Unable to load season");
    if (logQuery.isError) return loadError(logQuery.error, "Unable to load transactions");
    if (!detailQuery.data || !logQuery.data) return { state: "loading" };
    return { state: "ready", detail: detailQuery.data, transactions: logQuery.data };
  }, [
    valid,
    detailQuery.data,
    detailQuery.isError,
    detailQuery.error,
    logQuery.data,
    logQuery.isError,
    logQuery.error
  ]);

  return { view };
}
