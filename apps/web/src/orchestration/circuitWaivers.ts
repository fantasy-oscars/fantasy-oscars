import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "../lib/api";
import { confirm, notify } from "../notifications";
import type {
  ApiResult,
  CircuitClaim,
  CircuitClaims,
  CircuitLeagueDetail,
  CircuitRoster,
  CircuitSelectionSummary,
  CircuitWaiverRun,
  CircuitWaivers
} from "../lib/types";
import {
  circuitSelectionLabel,
  type CircuitRosterEntry
} from "../decisions/circuitRoster";
import {
  circuitClaimCapacityWarning,
  circuitClaimChipOptions,
  circuitClaimErrorMessage,
  circuitPendingClaims,
  circuitWaiversVisible
} from "../decisions/circuitWaivers";
import { errorCode, errorMessage, errorRequestId, unwrap } from "./query/errors";
import { queryKeys } from "./query/keys";
import {
  circuitClaimsQuery,
  circuitLeagueQuery,
  circuitRosterQuery,
  circuitWaiverResultsQuery,
  circuitWaiversQuery
} from "./query/queries";
import { useCircuitWaiverSocket } from "./useCircuitWaiverSocket";

/*
 * Waivers of a league's season: the viewer's own ranked claims while a
 * window is open, rolling priority and chips, and the results of each run.
 * Every claim write returns the viewer's claims, which replace the cached
 * read; a `waiver:result` on the league's room refreshes the rest.
 */

type LoadError = {
  state: "error";
  message: string;
  requestId?: string;
  notFound: boolean;
};

export type CircuitWaiversView =
  | { state: "loading" }
  | LoadError
  | {
      state: "ready";
      detail: CircuitLeagueDetail;
      waivers: CircuitWaivers;
      runs: CircuitWaiverRun[];
      /** The viewer's claims; null when they are not playing or not in season. */
      claims: CircuitClaims | null;
      /** The viewer's pending claims, first choice first. */
      pending: CircuitClaim[];
      /** A window is open and its claims can still change. */
      canClaim: boolean;
    };

/** The claim modal: a new claim on a contender, or an existing claim's options. */
export type CircuitClaimDraft = {
  claimId: number | null;
  selection: CircuitSelectionSummary;
  dropSelectionId: number | null;
  chipId: number | null;
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
    message: circuitClaimErrorMessage(
      { errorCode: errorCode(err), message: errorMessage(err, "") },
      fallback
    ),
    requestId: errorRequestId(err)
  };
}

export function useCircuitWaiversOrchestration(input: { circuitLeagueId: number }) {
  const { circuitLeagueId } = input;
  const queryClient = useQueryClient();
  const valid = Number.isInteger(circuitLeagueId) && circuitLeagueId > 0;
  const detailQuery = useQuery({
    ...circuitLeagueQuery(circuitLeagueId),
    enabled: valid
  });
  const detail = detailQuery.data;
  const isMember = detail?.viewer.is_member ?? false;
  const inSeason = detail?.circuit_league.status === "IN_SEASON";
  const visible = detail ? circuitWaiversVisible(detail.circuit_league.status) : false;
  const waiversQuery = useQuery({
    ...circuitWaiversQuery(circuitLeagueId),
    enabled: valid && visible
  });
  const resultsQuery = useQuery({
    ...circuitWaiverResultsQuery(circuitLeagueId),
    enabled: valid && visible
  });
  const claimsQuery = useQuery({
    ...circuitClaimsQuery(circuitLeagueId),
    enabled: valid && isMember && inSeason
  });
  const rosterQuery = useQuery({
    ...circuitRosterQuery(circuitLeagueId, null),
    enabled: valid && isMember && inSeason
  });
  useCircuitWaiverSocket({ circuitLeagueId, enabled: valid && isMember && visible });

  const [draft, setDraft] = useState<CircuitClaimDraft | null>(null);
  const [modalStatus, setModalStatus] = useState<ApiResult | null>(null);
  const [listStatus, setListStatus] = useState<ApiResult | null>(null);
  // The order shown while a reorder saves, so a row does not jump back.
  const [pendingOrder, setPendingOrder] = useState<number[] | null>(null);

  const applyClaims = useCallback(
    (next: CircuitClaims | undefined) => {
      if (next)
        queryClient.setQueryData(queryKeys.circuitLeagues.claims(circuitLeagueId), next);
    },
    [queryClient, circuitLeagueId]
  );

  const send = useCallback(
    async (method: string, path: string, body: unknown, fallback: string) =>
      unwrap(
        await fetchJson<CircuitClaims>(
          `/circuit-leagues/${circuitLeagueId}/claims${path}`,
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

  const saveMutation = useMutation({
    mutationFn: (d: CircuitClaimDraft) =>
      d.claimId === null
        ? send(
            "POST",
            "",
            {
              selection_id: d.selection.id,
              drop_selection_id: d.dropSelectionId,
              chip_id: d.chipId
            },
            "Could not file that claim"
          )
        : send(
            "PATCH",
            `/${d.claimId}`,
            { drop_selection_id: d.dropSelectionId, chip_id: d.chipId },
            "Could not save that claim"
          ),
    onSuccess: applyClaims
  });
  const withdrawMutation = useMutation({
    mutationFn: (claimId: number) =>
      send("DELETE", `/${claimId}`, undefined, "Could not withdraw that claim"),
    onSuccess: applyClaims
  });
  const reorderMutation = useMutation({
    mutationFn: (claimIds: number[]) =>
      send("PUT", "", { claim_ids: claimIds }, "Could not reorder your claims"),
    onSuccess: applyClaims
  });

  const claimWriteFailed = useCallback(
    (err: unknown, fallback: string, set: (r: ApiResult) => void) => {
      set(failure(err, fallback));
      // The claims changed elsewhere or were locked: show what the server holds.
      const code = errorCode(err);
      if (
        code === "CIRCUIT_WAIVER_CLAIMS_CHANGED" ||
        code === "CIRCUIT_WAIVER_CLAIMS_LOCKED"
      ) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.circuitLeagues.claims(circuitLeagueId)
        });
      }
    },
    [queryClient, circuitLeagueId]
  );

  const claims = claimsQuery.data ?? null;
  const view = useMemo<CircuitWaiversView>(() => {
    if (!valid) return { state: "error", message: "Season not found", notFound: true };
    if (detailQuery.isError) return loadError(detailQuery.error, "Unable to load season");
    if (!detail) return { state: "loading" };
    if (!circuitWaiversVisible(detail.circuit_league.status)) {
      return {
        state: "error",
        message: "Waivers open once the draft has finished.",
        notFound: false
      };
    }
    if (waiversQuery.isError)
      return loadError(waiversQuery.error, "Unable to load waivers");
    if (resultsQuery.isError) {
      return loadError(resultsQuery.error, "Unable to load waiver results");
    }
    if (claimsQuery.isError)
      return loadError(claimsQuery.error, "Unable to load your claims");
    const needsClaims = isMember && inSeason;
    if (!waiversQuery.data || !resultsQuery.data || (needsClaims && !claims)) {
      return { state: "loading" };
    }
    const pendingClaims = claims ? circuitPendingClaims(claims) : [];
    const byId = new Map(pendingClaims.map((c) => [c.id, c]));
    const ordered =
      pendingOrder && pendingOrder.every((id) => byId.has(id))
        ? pendingOrder.map((id) => byId.get(id)!)
        : pendingClaims;
    return {
      state: "ready",
      detail,
      waivers: waiversQuery.data,
      runs: resultsQuery.data,
      claims: needsClaims ? claims : null,
      pending: ordered,
      canClaim: needsClaims && claims !== null && claims.window !== null && !claims.locked
    };
  }, [
    valid,
    detail,
    detailQuery.isError,
    detailQuery.error,
    waiversQuery.data,
    waiversQuery.isError,
    waiversQuery.error,
    resultsQuery.data,
    resultsQuery.isError,
    resultsQuery.error,
    claims,
    claimsQuery.isError,
    claimsQuery.error,
    isMember,
    inSeason,
    pendingOrder
  ]);

  const roster: CircuitRoster | null = rosterQuery.data ?? null;

  /** Opens the modal for a new claim on `selection`; false if it is already claimed. */
  const startClaim = useCallback(
    (selection: CircuitSelectionSummary): boolean => {
      setListStatus(null);
      if (
        claims?.claims.some(
          (c) => c.status === "PENDING" && c.selection.id === selection.id
        )
      ) {
        setListStatus({
          ok: false,
          message: `You already have a claim for ${circuitSelectionLabel(selection)}.`
        });
        return false;
      }
      setModalStatus(null);
      setDraft({ claimId: null, selection, dropSelectionId: null, chipId: null });
      return true;
    },
    [claims]
  );

  const editClaim = useCallback((claim: CircuitClaim) => {
    setListStatus(null);
    setModalStatus(null);
    setDraft({
      claimId: claim.id,
      selection: claim.selection,
      dropSelectionId: claim.drop?.id ?? null,
      chipId: claim.chip?.id ?? null
    });
  }, []);

  const closeClaim = useCallback(() => {
    setDraft(null);
    setModalStatus(null);
  }, []);

  const changeDraft = useCallback(
    (patch: Partial<Pick<CircuitClaimDraft, "dropSelectionId" | "chipId">>) => {
      setDraft((d) => (d ? { ...d, ...patch } : d));
      setModalStatus(null);
    },
    []
  );

  /** Files or saves the claim in the modal; true once saved. */
  const saveClaim = useCallback(async (): Promise<boolean> => {
    if (!draft) return false;
    setModalStatus(null);
    try {
      await saveMutation.mutateAsync(draft);
    } catch (err) {
      claimWriteFailed(err, "Could not save that claim", setModalStatus);
      return false;
    }
    const label = circuitSelectionLabel(draft.selection);
    success(
      "circuitWaivers.claim.saved",
      draft.claimId === null ? `Claimed ${label}` : `Saved your claim for ${label}`
    );
    setDraft(null);
    return true;
  }, [draft, saveMutation, claimWriteFailed]);

  const withdraw = useCallback(
    async (claim: CircuitClaim) => {
      const label = circuitSelectionLabel(claim.selection);
      const ok = await confirm({
        title: `Withdraw your claim for ${label}?`,
        message: "Your other claims move up to fill its place.",
        confirmLabel: "Withdraw",
        danger: true
      });
      if (!ok) return;
      setListStatus(null);
      try {
        await withdrawMutation.mutateAsync(claim.id);
      } catch (err) {
        claimWriteFailed(err, "Could not withdraw that claim", setListStatus);
        return;
      }
      success("circuitWaivers.claim.withdrawn", `Withdrew your claim for ${label}`);
    },
    [withdrawMutation, claimWriteFailed]
  );

  const reorder = useCallback(
    async (claimIds: number[]) => {
      setListStatus(null);
      setPendingOrder(claimIds);
      try {
        await reorderMutation.mutateAsync(claimIds);
      } catch (err) {
        claimWriteFailed(err, "Could not reorder your claims", setListStatus);
      } finally {
        setPendingOrder(null);
      }
    },
    [reorderMutation, claimWriteFailed]
  );

  const dropOptions: CircuitRosterEntry[] = roster?.entries ?? [];
  const chipOptions =
    claims && draft ? circuitClaimChipOptions(claims.chips, draft.claimId) : [];
  const warning =
    roster && draft
      ? circuitClaimCapacityWarning(roster, draft.selection, draft.dropSelectionId)
      : null;

  return {
    view,
    draft,
    dropOptions,
    chipOptions,
    warning,
    saving: saveMutation.isPending,
    busy: withdrawMutation.isPending || reorderMutation.isPending,
    modalStatus,
    listStatus,
    startClaim,
    editClaim,
    closeClaim,
    changeDraft,
    saveClaim: () => void saveClaim(),
    withdraw: (claim: CircuitClaim) => void withdraw(claim),
    reorder: (claimIds: number[]) => void reorder(claimIds)
  };
}

export type CircuitWaiversOrchestration = ReturnType<
  typeof useCircuitWaiversOrchestration
>;
