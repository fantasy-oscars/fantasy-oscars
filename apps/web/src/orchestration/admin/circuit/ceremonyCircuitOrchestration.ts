import { useCallback, useEffect, useState } from "react";
import { notify } from "../../../notifications";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { useFieldErrors } from "../../useFieldErrors";
import { confirmStructuralEdit } from "./structuralConfirm";
import type { CeremonyCircuitAssociation, CeremonyCircuitOption } from "./types";

type LoadState = "loading" | "error" | "ready";

export type CeremonyDatesForm = { nominationsOn: string; resultsOn: string };

/** API field -> form input. */
const DATE_FIELD_INPUTS = {
  nominations_on: "nominationsOn",
  results_on: "resultsOn"
} as const;

function notifySuccess(id: string, message: string) {
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

/**
 * The ceremony side of the Circuit association, plus the ceremony's nomination
 * and results dates. Both can be edited at any ceremony status.
 */
export function useAdminCeremonyCircuitOrchestration(args: {
  ceremonyId: number | null;
}) {
  const { ceremonyId } = args;
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [associations, setAssociations] = useState<CeremonyCircuitAssociation[]>([]);
  const [circuitOptions, setCircuitOptions] = useState<CeremonyCircuitOption[]>([]);
  const [datesForm, setDatesForm] = useState<CeremonyDatesForm>({
    nominationsOn: "",
    resultsOn: ""
  });
  const [savingDates, setSavingDates] = useState(false);
  const [datesStatus, setDatesStatus] = useState<ApiResult | null>(null);
  const [working, setWorking] = useState(false);
  const [associationStatus, setAssociationStatus] = useState<ApiResult | null>(null);
  const fieldErrors = useFieldErrors();
  const { applyFailure, reset: resetFieldErrors } = fieldErrors;

  const loadCircuits = useCallback(async () => {
    if (ceremonyId === null) return false;
    const res = await fetchJson<{
      associations: CeremonyCircuitAssociation[];
      circuits: CeremonyCircuitOption[];
    }>(`/admin/ceremonies/${ceremonyId}/circuits`, { method: "GET" });
    if (!res.ok) {
      setError(res.error ?? "Unable to load Circuits");
      return false;
    }
    setAssociations(res.data?.associations ?? []);
    setCircuitOptions(res.data?.circuits ?? []);
    return true;
  }, [ceremonyId]);

  const load = useCallback(async () => {
    if (ceremonyId === null) {
      setError("Invalid ceremony id");
      setState("error");
      return;
    }
    const [circuitsOk, ceremonyRes] = await Promise.all([
      loadCircuits(),
      fetchJson<{
        ceremony: { nominations_on?: string | null; results_on?: string | null };
      }>(`/admin/ceremonies/${ceremonyId}`, { method: "GET" })
    ]);
    if (!circuitsOk || !ceremonyRes.ok) {
      if (!ceremonyRes.ok) setError(ceremonyRes.error ?? "Unable to load ceremony");
      setState("error");
      return;
    }
    const ceremony = ceremonyRes.data?.ceremony;
    setDatesForm({
      nominationsOn: ceremony?.nominations_on ?? "",
      resultsOn: ceremony?.results_on ?? ""
    });
    setError(null);
    setState("ready");
  }, [ceremonyId, loadCircuits]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveDates = useCallback(async () => {
    if (ceremonyId === null) return false;
    setSavingDates(true);
    setDatesStatus(null);
    resetFieldErrors();
    const res = await fetchJson<{
      ceremony: { nominations_on: string | null; results_on: string | null };
    }>(`/admin/ceremonies/${ceremonyId}/dates`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nominations_on: datesForm.nominationsOn || null,
        results_on: datesForm.resultsOn || null
      })
    });
    setSavingDates(false);
    if (!res.ok) {
      applyFailure(res, DATE_FIELD_INPUTS);
      setDatesStatus({ ok: false, message: res.error ?? "Could not save the dates" });
      return false;
    }
    setDatesForm({
      nominationsOn: res.data?.ceremony.nominations_on ?? "",
      resultsOn: res.data?.ceremony.results_on ?? ""
    });
    notifySuccess("admin.ceremony.dates.save.success", "Dates saved.");
    return true;
  }, [ceremonyId, datesForm, applyFailure, resetFieldErrors]);

  const runCircuitWrite = useCallback(
    async (init: { path: string; method: string; body?: object }, message: string) => {
      setWorking(true);
      setAssociationStatus(null);
      const res = await fetchJson(init.path, {
        method: init.method,
        ...(init.body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(init.body)
            }
          : {})
      });
      setWorking(false);
      if (!res.ok) {
        setAssociationStatus({
          ok: false,
          message: res.error ?? "The change was not saved"
        });
        return false;
      }
      notifySuccess("admin.ceremony.circuit.success", message);
      await loadCircuits();
      return true;
    },
    [loadCircuits]
  );

  /**
   * Adds this ceremony to a Circuit, or moves it to another event of one it
   * is already in. Without an event it gets its own one-ceremony event.
   */
  const associate = useCallback(
    async (circuitId: number, circuitEventId: number | null) => {
      if (ceremonyId === null) return false;
      const circuit = circuitOptions.find((c) => c.id === circuitId);
      if (!circuit) return false;
      const isNew = !associations.some((a) => a.circuit_id === circuitId);
      const ok = await confirmStructuralEdit({
        circuitStatus: circuit.status,
        circuitName: circuit.name,
        action: isNew ? "Adding this ceremony" : "Moving this ceremony to another event"
      });
      if (!ok) return false;
      return runCircuitWrite(
        {
          path: `/admin/ceremonies/${ceremonyId}/circuits/${circuitId}`,
          method: "PUT",
          body: { circuit_event_id: circuitEventId }
        },
        isNew ? "Added to the Circuit." : "Moved to another event."
      );
    },
    [ceremonyId, circuitOptions, associations, runCircuitWrite]
  );

  const remove = useCallback(
    async (circuitId: number) => {
      if (ceremonyId === null) return false;
      const association = associations.find((a) => a.circuit_id === circuitId);
      if (!association) return false;
      const ok = await confirmStructuralEdit({
        circuitStatus: association.circuit_status,
        circuitName: association.circuit_name,
        action: "Removing this ceremony and its mappings"
      });
      if (!ok) return false;
      return runCircuitWrite(
        {
          path: `/admin/ceremonies/${ceremonyId}/circuits/${circuitId}`,
          method: "DELETE"
        },
        "Removed from the Circuit."
      );
    },
    [ceremonyId, associations, runCircuitWrite]
  );

  return {
    state,
    error,
    associations,
    circuitOptions,
    datesForm,
    setDatesForm,
    savingDates,
    datesStatus,
    fieldErrors: fieldErrors.errors,
    clearFieldError: fieldErrors.clear,
    working,
    associationStatus,
    actions: { saveDates, associate, remove }
  };
}
