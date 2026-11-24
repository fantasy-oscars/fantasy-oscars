import { useCallback, useEffect, useState } from "react";
import { notify } from "../../../notifications";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import {
  circuitTemplateOptions,
  pendingMappingChanges,
  type MappingChoices
} from "../../../decisions/admin/circuit";
import type { CircuitLayoutWrite } from "../../../decisions/admin/circuitLayout";
import { fetchAdminCeremonies, sortCeremonies } from "../ceremonies/fetchCeremonies";
import type { CeremonyOption } from "../ceremonies/types";
import {
  confirmQuery,
  confirmStructuralEdit,
  runStructuralWrite
} from "./structuralConfirm";
import type {
  CircuitCategoryTemplate,
  CircuitDetail,
  CircuitReadiness,
  MissingCeremonyDates
} from "./types";

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

function jsonInit(method: string, body: object) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}

export function useAdminCircuitDetailOrchestration(args: { circuitId: number | null }) {
  const { circuitId } = args;
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CircuitDetail | null>(null);
  const [readiness, setReadiness] = useState<CircuitReadiness | null>(null);
  const [ceremonies, setCeremonies] = useState<CeremonyOption[]>([]);
  const [templates, setTemplates] = useState<CircuitCategoryTemplate[]>([]);
  const [iconCodes, setIconCodes] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<ApiResult | null>(null);
  // Set by a successful activation; the response lists ceremonies lacking a date.
  const [activationMissing, setActivationMissing] = useState<
    MissingCeremonyDates[] | null
  >(null);

  const load = useCallback(async () => {
    if (circuitId === null) {
      setError("Invalid Circuit id");
      setState("error");
      return;
    }
    const [res, readinessRes, ceremoniesRes, templatesRes, iconsRes] = await Promise.all([
      fetchJson<CircuitDetail>(`/admin/circuits/${circuitId}`, { method: "GET" }),
      fetchJson<CircuitReadiness>(`/admin/circuits/${circuitId}/readiness`, {
        method: "GET"
      }),
      fetchAdminCeremonies(),
      fetchJson<{ families: CircuitCategoryTemplate[] }>("/admin/category-families", {
        method: "GET"
      }),
      fetchJson<{ icons: Array<{ code: string }> }>("/admin/icons", { method: "GET" })
    ]);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Unable to load the Circuit");
      setState("error");
      return;
    }
    setDetail(res.data);
    // The report is a read-only aid: a failure leaves the editor usable.
    setReadiness(readinessRes.ok ? (readinessRes.data ?? null) : null);
    setCeremonies(sortCeremonies(ceremoniesRes.data?.ceremonies ?? []));
    setTemplates(circuitTemplateOptions(templatesRes.data?.families ?? []));
    // Without the icon list the picker offers nothing; the rest still works.
    setIconCodes((iconsRes.data?.icons ?? []).map((i) => i.code));
    setError(null);
    setState("ready");
  }, [circuitId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Runs one write, reports a failure inline, and reloads on success. */
  const write = useCallback(
    async (
      run: () => Promise<Awaited<ReturnType<typeof fetchJson>> | null>,
      success: { id: string; message: string }
    ) => {
      setWorking(true);
      setStatus(null);
      const res = await run();
      setWorking(false);
      // The admin declined the confirmation.
      if (res === null) return false;
      if (!res.ok) {
        setStatus({ ok: false, message: res.error ?? "The change was not saved" });
        return false;
      }
      notifySuccess(success.id, success.message);
      await load();
      return true;
    },
    [load]
  );

  /** Confirms a structural edit on an active Circuit, then runs it. */
  const structural = useCallback(
    async (
      action: string,
      run: (base: string) => ReturnType<typeof fetchJson>,
      success: { id: string; message: string }
    ) => {
      if (!detail) return false;
      const { circuit } = detail;
      const ok = await confirmStructuralEdit({
        circuitStatus: circuit.status,
        circuitName: circuit.name,
        action
      });
      if (!ok) return false;
      return write(() => run(`/admin/circuits/${circuit.id}`), success);
    },
    [detail, write]
  );

  /**
   * Confirms and runs a write that changes what initialised leagues score:
   * the confirmation names those leagues, and the write carries it.
   */
  const scoringWrite = useCallback(
    async (
      action: string,
      run: (base: string, confirmed: boolean) => ReturnType<typeof fetchJson>,
      success: { id: string; message: string }
    ) => {
      if (!detail) return false;
      const { circuit } = detail;
      return write(
        () =>
          runStructuralWrite({
            circuitStatus: circuit.status,
            circuitName: circuit.name,
            action,
            leagues: detail.initialized_leagues,
            run: (confirmed) => run(`/admin/circuits/${circuit.id}`, confirmed)
          }),
        success
      );
    },
    [detail, write]
  );

  /** Appends a ceremony to the top level, ungrouped, with its own event. */
  const addCeremony = useCallback(
    (ceremonyId: number) =>
      scoringWrite(
        "Adding a ceremony",
        (base, confirmed) =>
          fetchJson(
            `${base}/ceremonies/${ceremonyId}${confirmQuery(confirmed)}`,
            jsonInit("PUT", {})
          ),
        { id: "admin.circuit.associate.success", message: "Ceremony added." }
      ),
    [scoringWrite]
  );

  const removeCeremony = useCallback(
    (ceremonyId: number) =>
      scoringWrite(
        "Removing a ceremony and its mappings",
        (base, confirmed) =>
          fetchJson(`${base}/ceremonies/${ceremonyId}${confirmQuery(confirmed)}`, {
            method: "DELETE"
          }),
        { id: "admin.circuit.remove.success", message: "Ceremony removed." }
      ),
    [scoringWrite]
  );

  /** Creates an empty, named group; ceremonies join it from the list. */
  const addGroup = useCallback(
    (name: string) =>
      structural(
        "Adding a group",
        (base) => fetchJson(`${base}/events`, jsonInit("POST", { name: name.trim() })),
        { id: "admin.circuit.group.create.success", message: "Group added." }
      ),
    [structural]
  );

  /** Renames change no scoring, so they need no confirmation. */
  const renameGroup = useCallback(
    (eventId: number, name: string) => {
      if (!detail) return Promise.resolve(false);
      return write(
        () =>
          fetchJson(
            `/admin/circuits/${detail.circuit.id}/events/${eventId}`,
            jsonInit("PATCH", { name: name.trim() })
          ),
        { id: "admin.circuit.group.rename.success", message: "Group renamed." }
      );
    },
    [detail, write]
  );

  /** Deletes a group; each of its ceremonies goes back to the top level. */
  const deleteGroup = useCallback(
    (eventId: number) =>
      structural(
        "Deleting a group",
        (base) => fetchJson(`${base}/events/${eventId}`, { method: "DELETE" }),
        { id: "admin.circuit.group.delete.success", message: "Group deleted." }
      ),
    [structural]
  );

  /**
   * Saves one change to the Ceremonies list: a ceremony placed in a group or
   * at the top level, or a new order of the top-level items.
   */
  const applyLayout = useCallback(
    (change: CircuitLayoutWrite) => {
      if (change.kind === "moveCeremony") {
        return structural(
          "Moving a ceremony",
          (base) =>
            fetchJson(
              `${base}/ceremonies/${change.ceremonyId}/position`,
              jsonInit("PUT", { group_id: change.groupId, index: change.index })
            ),
          { id: "admin.circuit.move.success", message: "Ceremony moved." }
        );
      }
      // The order lists every event; one left empty some other way stays last.
      const listed = new Set(change.eventIds);
      const eventIds = [
        ...change.eventIds,
        ...(detail?.events ?? []).map((e) => e.id).filter((id) => !listed.has(id))
      ];
      return structural(
        "Reordering ceremonies",
        (base) =>
          fetchJson(`${base}/events/order`, jsonInit("PUT", { event_ids: eventIds })),
        { id: "admin.circuit.event.order.success", message: "Ceremonies reordered." }
      );
    },
    [detail, structural]
  );

  const addCategory = useCallback(
    (templateId: number) =>
      structural(
        "Adding a category",
        (base) =>
          fetchJson(
            `${base}/categories`,
            jsonInit("POST", { category_family_id: templateId })
          ),
        { id: "admin.circuit.category.add.success", message: "Category added." }
      ),
    [structural]
  );

  /** Renames change no scoring, so they need no confirmation. */
  const renameCategory = useCallback(
    (categoryId: number, name: string) => {
      if (!detail) return Promise.resolve(false);
      return write(
        () =>
          fetchJson(
            `/admin/circuits/${detail.circuit.id}/categories/${categoryId}`,
            jsonInit("PATCH", { name: name.trim() })
          ),
        { id: "admin.circuit.category.rename.success", message: "Category renamed." }
      );
    },
    [detail, write]
  );

  /** An icon is not scoring, so like a rename it needs no confirmation. */
  const setCategoryIcon = useCallback(
    (categoryId: number, icon: string) => {
      if (!detail) return Promise.resolve(false);
      return write(
        () =>
          fetchJson(
            `/admin/circuits/${detail.circuit.id}/categories/${categoryId}/icon`,
            jsonInit("PUT", { icon })
          ),
        { id: "admin.circuit.category.icon.success", message: "Category icon changed." }
      );
    },
    [detail, write]
  );

  const reorderCategories = useCallback(
    (categoryIds: number[]) =>
      structural(
        "Reordering categories",
        (base) =>
          fetchJson(
            `${base}/categories/order`,
            jsonInit("PUT", { category_ids: categoryIds })
          ),
        { id: "admin.circuit.category.order.success", message: "Categories reordered." }
      ),
    [structural]
  );

  const removeCategory = useCallback(
    (categoryId: number) =>
      structural(
        "Removing a category and its mappings",
        (base) => fetchJson(`${base}/categories/${categoryId}`, { method: "DELETE" }),
        { id: "admin.circuit.category.remove.success", message: "Category removed." }
      ),
    [structural]
  );

  /**
   * Saves one ceremony's mapping choices from the mapping modal: every shown
   * mapping of its categories that differs from what is saved.
   */
  const saveMappings = useCallback(
    async (ceremonyId: number, choices: MappingChoices) => {
      if (!detail) return false;
      const changes = pendingMappingChanges(
        detail.category_editions.filter((e) => e.ceremony_id === ceremonyId),
        choices,
        detail.categories.map((c) => c.id)
      );
      if (changes.length === 0) return true;
      const { circuit } = detail;
      setWorking(true);
      setStatus(null);
      // The confirmation precedes the first change, so a refusal for
      // unconfirmed leagues leaves every mapping as it was.
      const result = await runStructuralWrite({
        circuitStatus: circuit.status,
        circuitName: circuit.name,
        action: "Changing category mappings",
        leagues: detail.initialized_leagues,
        run: async (confirmed) => {
          for (const change of changes) {
            const path = `/admin/circuits/${circuit.id}/mappings/${change.categoryEditionId}${confirmQuery(confirmed)}`;
            const res =
              change.circuitCategoryId === null
                ? await fetchJson(path, { method: "DELETE" })
                : await fetchJson(
                    path,
                    jsonInit("PUT", { circuit_category_id: change.circuitCategoryId })
                  );
            if (!res.ok) return res;
          }
          return { ok: true };
        }
      });
      if (result === null) {
        setWorking(false);
        return false;
      }
      if (!result.ok) {
        setWorking(false);
        setStatus({
          ok: false,
          message:
            ("error" in result ? result.error : undefined) ??
            "Some mappings were not saved"
        });
        await load();
        return false;
      }
      setWorking(false);
      notifySuccess("admin.circuit.mapping.success", "Mappings saved.");
      await load();
      return true;
    },
    [detail, load]
  );

  const activate = useCallback(async () => {
    if (!detail) return false;
    setWorking(true);
    setStatus(null);
    const res = await fetchJson<{
      readiness: { missing_dates: MissingCeremonyDates[] };
    }>(`/admin/circuits/${detail.circuit.id}/activate`, { method: "POST" });
    setWorking(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Could not activate the Circuit" });
      return false;
    }
    setActivationMissing(res.data?.readiness.missing_dates ?? []);
    notifySuccess("admin.circuit.activate.success", "Circuit activated.");
    await load();
    return true;
  }, [detail, load]);

  return {
    state,
    error,
    detail,
    readiness,
    ceremonies,
    templates,
    iconCodes,
    working,
    status,
    activationMissing,
    actions: {
      addCeremony,
      removeCeremony,
      addGroup,
      renameGroup,
      deleteGroup,
      applyLayout,
      addCategory,
      renameCategory,
      setCategoryIcon,
      reorderCategories,
      removeCategory,
      saveMappings,
      activate
    }
  };
}
