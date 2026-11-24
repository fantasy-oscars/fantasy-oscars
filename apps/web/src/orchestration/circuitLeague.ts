import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "../lib/api";
import { confirm, notify } from "../notifications";
import type { ApiResult, CircuitLeagueDetail } from "../lib/types";
import { circuitLeagueEditable } from "../decisions/circuitLeague";
import {
  circuitAddDropTarget,
  circuitAddDropVisible,
  type CircuitAddDropTarget
} from "../decisions/circuitAddDrop";
import {
  fullSeasonSettingsFrom,
  fullSeasonWrites,
  type FullSeasonSettings,
  type SettingsArea
} from "../decisions/fullSeasonSettings";
import { errorCode, errorMessage, errorRequestId, unwrap } from "./query/errors";
import { queryKeys } from "./query/keys";
import {
  circuitClaimsQuery,
  circuitLeagueQuery,
  circuitRosterQuery
} from "./query/queries";

/*
 * One league's competition in a Circuit (a "season" to players): its settings,
 * saved one area at a time, members, join and leave, and initialisation. Every
 * write returns the full detail, which replaces the cached read. While the
 * season is in progress a member's Add/drop entry reads their roster's free
 * agency and, while it is closed, their claims, to choose where it leads.
 */

export type CircuitLeagueView =
  | { state: "loading" }
  | { state: "error"; message: string; requestId?: string; notFound: boolean }
  | {
      state: "ready";
      detail: CircuitLeagueDetail;
      settings: FullSeasonSettings;
      editable: { all: boolean; draftClock: boolean };
    };

/** The outcome of saving one settings area. */
export type AreaSaveResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      requestId?: string;
      /** The stored values when only part of the save landed. */
      latest?: FullSeasonSettings;
    };

/** The season was locked while the commissioner was editing. */
const LOCKED_CODES = new Set(["CIRCUIT_LEAGUE_SETTINGS_LOCKED", "CIRCUIT_LEAGUE_LOCKED"]);

type Action = "join" | "leave" | "initialize";

const ACTION_SUCCESS: Record<Action, string> = {
  join: "You joined the season",
  leave: "You left the season",
  initialize: "Season locked"
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

export function useCircuitLeagueOrchestration(input: { circuitLeagueId: number }) {
  const { circuitLeagueId } = input;
  const queryClient = useQueryClient();
  const valid = Number.isInteger(circuitLeagueId) && circuitLeagueId > 0;
  const query = useQuery({ ...circuitLeagueQuery(circuitLeagueId), enabled: valid });
  const data = query.data;
  const addDropShown = data
    ? circuitAddDropVisible({
        status: data.circuit_league.status,
        isMember: data.viewer.is_member
      })
    : false;
  const rosterQuery = useQuery({
    ...circuitRosterQuery(circuitLeagueId, null),
    enabled: valid && addDropShown
  });
  const freeAgency = rosterQuery.data?.free_agency;
  const claimsQuery = useQuery({
    ...circuitClaimsQuery(circuitLeagueId),
    enabled: valid && addDropShown && freeAgency !== undefined && !freeAgency.open
  });
  const claims = claimsQuery.data;
  const claimsSettled = claims !== undefined || claimsQuery.isError;
  const addDrop = useMemo<CircuitAddDropTarget | null>(() => {
    // Shown once its destination is known; the claims read decides only while free agency is closed.
    if (!addDropShown || !freeAgency) return null;
    if (!freeAgency.open && !claimsSettled) return null;
    return circuitAddDropTarget({ freeAgency, claims: claims ?? null });
  }, [addDropShown, freeAgency, claims, claimsSettled]);

  // Join and leave report under the header; locking reports beside its button.
  const [memberStatus, setMemberStatus] = useState<ApiResult | null>(null);
  const [lockStatus, setLockStatus] = useState<ApiResult | null>(null);

  const apply = useCallback(
    (detail: CircuitLeagueDetail | undefined) => {
      if (!detail) return;
      queryClient.setQueryData(queryKeys.circuitLeagues.detail(circuitLeagueId), detail);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.leagues.circuits(detail.league.id)
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.leagues.detail(detail.league.id)
      });
    },
    [queryClient, circuitLeagueId]
  );

  const send = useCallback(
    async (path: string, method: string, body?: unknown) =>
      unwrap(
        await fetchJson<CircuitLeagueDetail>(
          `/circuit-leagues/${circuitLeagueId}${path}`,
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
        "Could not update the season"
      ),
    [circuitLeagueId]
  );

  const saveMutation = useMutation({
    mutationFn: async (vars: {
      detail: CircuitLeagueDetail;
      next: FullSeasonSettings;
    }) => {
      const { detail, next } = vars;
      const writes = fullSeasonWrites(
        fullSeasonSettingsFrom(detail),
        next,
        detail.events,
        detail.categories
      );
      // Each write returns the full detail; apply it as soon as it lands so a
      // later failure leaves the earlier part saved and shown.
      let done = 0;
      try {
        if (writes.settings) {
          apply(await send("/settings", "PATCH", writes.settings));
          done += 1;
        }
        if (writes.events) {
          apply(await send("/events", "PUT", { events: writes.events }));
          done += 1;
        }
        if (writes.categories) {
          apply(await send("/categories", "PUT", { categories: writes.categories }));
          done += 1;
        }
      } catch (err) {
        throw Object.assign(new Error(errorMessage(err, "Could not save settings")), {
          cause: err,
          partial: done > 0
        });
      }
    }
  });

  const actionMutation = useMutation({
    mutationFn: async (action: Action) => send(`/${action}`, "POST"),
    onSuccess: apply
  });

  const view = useMemo<CircuitLeagueView>(() => {
    if (!valid) {
      return { state: "error", message: "Season not found", notFound: true };
    }
    if (data) {
      return {
        state: "ready",
        detail: data,
        settings: fullSeasonSettingsFrom(data),
        editable: circuitLeagueEditable(data.circuit_league.status)
      };
    }
    if (query.isError) {
      const code = errorCode(query.error);
      return {
        state: "error",
        message: errorMessage(query.error, "Unable to load season"),
        requestId: errorRequestId(query.error),
        notFound: code === "NOT_FOUND" || code === "LEAGUE_NOT_FOUND"
      };
    }
    return { state: "loading" };
  }, [valid, data, query.isError, query.error]);

  /**
   * Saves one area: its settings patch first, then its events or categories.
   * A lock that landed meanwhile refreshes the detail, so the area turns
   * read-only.
   */
  const saveArea = useCallback(
    async (_area: SettingsArea, next: FullSeasonSettings): Promise<AreaSaveResult> => {
      if (!data) return { ok: false, message: "Season not loaded" };
      try {
        await saveMutation.mutateAsync({ detail: data, next });
        return { ok: true };
      } catch (err) {
        const { cause, partial } = err as Error & { cause?: unknown; partial?: boolean };
        if (LOCKED_CODES.has(errorCode(cause) ?? "")) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.circuitLeagues.detail(circuitLeagueId)
          });
        }
        const message = errorMessage(cause, "Could not save settings");
        const latest = partial
          ? queryClient.getQueryData<CircuitLeagueDetail>(
              queryKeys.circuitLeagues.detail(circuitLeagueId)
            )
          : undefined;
        return {
          ok: false,
          message: partial ? `Some changes weren't saved: ${message}` : message,
          requestId: errorRequestId(cause),
          ...(latest ? { latest: fullSeasonSettingsFrom(latest) } : {})
        };
      }
    },
    [data, saveMutation, queryClient, circuitLeagueId]
  );

  const runAction = useCallback(
    async (action: Action) => {
      if (!data) return;
      if (action === "initialize") {
        const ok = await confirm({
          title: "Lock this season?",
          message:
            "Locking closes membership and freezes events, roster and scoring. The pick clock and auto-draft can still change until the draft starts.",
          confirmLabel: "Lock season"
        });
        if (!ok) return;
      }
      const setStatus = action === "initialize" ? setLockStatus : setMemberStatus;
      setStatus(null);
      try {
        await actionMutation.mutateAsync(action);
        success(`circuitLeague.${action}.success`, ACTION_SUCCESS[action]);
      } catch (err) {
        setStatus({
          ok: false,
          message: errorMessage(err, "Could not update the season"),
          requestId: errorRequestId(err)
        });
      }
    },
    [data, actionMutation]
  );

  return {
    view,
    /** Where Add/drop leads; null while it is hidden or its reads are loading. */
    addDrop,
    acting: actionMutation.isPending,
    memberStatus,
    lockStatus,
    saveArea,
    join: () => runAction("join"),
    leave: () => runAction("leave"),
    initialize: () => runAction("initialize")
  };
}
