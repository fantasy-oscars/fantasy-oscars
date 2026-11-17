import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "../lib/api";
import { confirm, notify } from "../notifications";
import type { ApiResult, CircuitLeagueDetail } from "../lib/types";
import {
  circuitLeagueChanges,
  circuitLeagueEditable,
  circuitLeagueFormFrom,
  hasCircuitLeagueChanges,
  type CircuitLeagueForm
} from "../decisions/circuitLeague";
import { errorCode, errorMessage, errorRequestId, unwrap } from "./query/errors";
import { queryKeys } from "./query/keys";
import { circuitLeagueQuery } from "./query/queries";

/*
 * One league's competition in a Circuit (a "season" to players): its settings
 * form, members, join and leave, and initialisation. Every write returns the
 * full detail, which replaces the cached read.
 */

export type CircuitLeagueView =
  | { state: "loading" }
  | { state: "error"; message: string; requestId?: string; notFound: boolean }
  | {
      state: "ready";
      detail: CircuitLeagueDetail;
      form: CircuitLeagueForm;
      editable: { all: boolean; draftClock: boolean };
      dirty: boolean;
    };

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

  // Edits belong to the detail they started from; a new detail (after a save)
  // starts a fresh form.
  const [edit, setEdit] = useState<{
    source: CircuitLeagueDetail;
    form: CircuitLeagueForm;
  } | null>(null);
  const form = useMemo(
    () =>
      data
        ? edit && edit.source === data
          ? edit.form
          : circuitLeagueFormFrom(data)
        : null,
    [data, edit]
  );

  const [settingsStatus, setSettingsStatus] = useState<ApiResult | null>(null);
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
      form: CircuitLeagueForm;
    }) => {
      const changes = circuitLeagueChanges(vars.detail, vars.form);
      let latest: CircuitLeagueDetail | undefined;
      // Each write returns the full detail; apply it as soon as it lands so a
      // later failure leaves the earlier parts saved and shown.
      if (changes.settings) {
        latest = await send("/settings", "PATCH", changes.settings);
        apply(latest);
      }
      if (changes.events) {
        latest = await send("/events", "PUT", { events: changes.events });
        apply(latest);
      }
      if (changes.categories) {
        latest = await send("/categories", "PUT", { categories: changes.categories });
        apply(latest);
      }
      return latest;
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
    if (data && form) {
      return {
        state: "ready",
        detail: data,
        form,
        editable: circuitLeagueEditable(data.circuit_league.status),
        dirty: hasCircuitLeagueChanges(circuitLeagueChanges(data, form))
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
  }, [valid, data, form, query.isError, query.error]);

  const updateForm = useCallback(
    (patch: (prev: CircuitLeagueForm) => CircuitLeagueForm) => {
      if (!data || !form) return;
      setSettingsStatus(null);
      setEdit({ source: data, form: patch(form) });
    },
    [data, form]
  );

  const resetForm = useCallback(() => {
    setSettingsStatus(null);
    setEdit(null);
  }, []);

  const save = useCallback(async () => {
    if (!data || !form) return;
    setSettingsStatus(null);
    try {
      await saveMutation.mutateAsync({ detail: data, form });
      success("circuitLeague.settings.saved", "Settings saved");
    } catch (err) {
      // Keep the unsaved edits on top of whatever parts did save.
      const latest = queryClient.getQueryData<CircuitLeagueDetail>(
        queryKeys.circuitLeagues.detail(circuitLeagueId)
      );
      if (latest) setEdit({ source: latest, form });
      setSettingsStatus({
        ok: false,
        message: errorMessage(err, "Could not save settings"),
        requestId: errorRequestId(err)
      });
    }
  }, [data, form, saveMutation, queryClient, circuitLeagueId]);

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
    saving: saveMutation.isPending,
    acting: actionMutation.isPending,
    settingsStatus,
    memberStatus,
    lockStatus,
    updateForm,
    resetForm,
    save,
    join: () => runAction("join"),
    leave: () => runAction("leave"),
    initialize: () => runAction("initialize")
  };
}
