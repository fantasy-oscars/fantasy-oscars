import { useCallback, useEffect, useState } from "react";
import { notify } from "../../../notifications";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { confirmQuery, runStructuralWrite } from "./structuralConfirm";
import type { CeremonyCircuitAssociation, CeremonyCircuitOption } from "./types";

type LoadState = "loading" | "error" | "ready";

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
 * The ceremony side of the Circuit association: attach to a Circuit or detach
 * from one, at any ceremony status. Grouping is done in the Circuit editor.
 */
export function useAdminCeremonyCircuitOrchestration(args: {
  ceremonyId: number | null;
}) {
  const { ceremonyId } = args;
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [associations, setAssociations] = useState<CeremonyCircuitAssociation[]>([]);
  const [circuitOptions, setCircuitOptions] = useState<CeremonyCircuitOption[]>([]);
  const [working, setWorking] = useState(false);
  const [associationStatus, setAssociationStatus] = useState<ApiResult | null>(null);

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
    if (!(await loadCircuits())) {
      setState("error");
      return;
    }
    setError(null);
    setState("ready");
  }, [ceremonyId, loadCircuits]);

  useEffect(() => {
    void load();
  }, [load]);

  const runCircuitWrite = useCallback(
    async (
      init: { path: string; method: string; body?: object },
      circuit: { status: string; name: string; action: string },
      message: string
    ) => {
      setWorking(true);
      setAssociationStatus(null);
      const res = await runStructuralWrite({
        circuitStatus: circuit.status,
        circuitName: circuit.name,
        action: circuit.action,
        run: (confirmed) =>
          fetchJson(`${init.path}${confirmQuery(confirmed)}`, {
            method: init.method,
            ...(init.body
              ? {
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(init.body)
                }
              : {})
          })
      });
      setWorking(false);
      // The admin declined the confirmation.
      if (res === null) return false;
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

  /** Attaches this ceremony to a Circuit, ungrouped, with its own event. */
  const associate = useCallback(
    async (circuitId: number) => {
      if (ceremonyId === null) return false;
      const circuit = circuitOptions.find((c) => c.id === circuitId);
      if (!circuit || associations.some((a) => a.circuit_id === circuitId)) return false;
      return runCircuitWrite(
        { path: `/admin/ceremonies/${ceremonyId}/circuits/${circuitId}`, method: "PUT" },
        { status: circuit.status, name: circuit.name, action: "Adding this ceremony" },
        "Added to the Circuit."
      );
    },
    [ceremonyId, circuitOptions, associations, runCircuitWrite]
  );

  const remove = useCallback(
    async (circuitId: number) => {
      if (ceremonyId === null) return false;
      const association = associations.find((a) => a.circuit_id === circuitId);
      if (!association) return false;
      return runCircuitWrite(
        {
          path: `/admin/ceremonies/${ceremonyId}/circuits/${circuitId}`,
          method: "DELETE"
        },
        {
          status: association.circuit_status,
          name: association.circuit_name,
          action: "Removing this ceremony and its mappings"
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
    working,
    associationStatus,
    actions: { associate, remove }
  };
}
