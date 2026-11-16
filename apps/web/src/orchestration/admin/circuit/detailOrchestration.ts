import { useCallback, useEffect, useState } from "react";
import { notify } from "../../../notifications";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import {
  circuitTemplateOptions,
  moveInOrder,
  pendingMappingChanges,
  type MappingChoices
} from "../../../decisions/admin/circuit";
import { fetchAdminCeremonies, sortCeremonies } from "../ceremonies/fetchCeremonies";
import type { CeremonyOption } from "../ceremonies/types";
import { confirmStructuralEdit } from "./structuralConfirm";
import type {
  CircuitCategoryTemplate,
  CircuitDetail,
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
  const [ceremonies, setCeremonies] = useState<CeremonyOption[]>([]);
  const [templates, setTemplates] = useState<CircuitCategoryTemplate[]>([]);
  // Unsaved mapping choices; the screen shows them over the saved mappings
  // and the template suggestions until the admin saves.
  const [mappingChoices, setMappingChoices] = useState<MappingChoices>({});
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
    const [res, ceremoniesRes, templatesRes] = await Promise.all([
      fetchJson<CircuitDetail>(`/admin/circuits/${circuitId}`, { method: "GET" }),
      fetchAdminCeremonies(),
      fetchJson<{ families: CircuitCategoryTemplate[] }>("/admin/category-families", {
        method: "GET"
      })
    ]);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Unable to load the Circuit");
      setState("error");
      return;
    }
    setDetail(res.data);
    setCeremonies(sortCeremonies(ceremoniesRes.data?.ceremonies ?? []));
    setTemplates(circuitTemplateOptions(templatesRes.data?.families ?? []));
    setError(null);
    setState("ready");
  }, [circuitId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Runs one write, reports a failure inline, and reloads on success. */
  const write = useCallback(
    async (
      run: () => ReturnType<typeof fetchJson>,
      success: { id: string; message: string }
    ) => {
      setWorking(true);
      setStatus(null);
      const res = await run();
      setWorking(false);
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
   * Adds a ceremony, or moves an associated one, into an event. Without an
   * event the ceremony gets its own one-ceremony event.
   */
  const placeCeremony = useCallback(
    (ceremonyId: number, circuitEventId: number | null) => {
      const isNew = !detail?.ceremonies.some((c) => c.ceremony_id === ceremonyId);
      return structural(
        isNew ? "Adding a ceremony" : "Moving a ceremony to another event",
        (base) =>
          fetchJson(
            `${base}/ceremonies/${ceremonyId}`,
            jsonInit("PUT", { circuit_event_id: circuitEventId })
          ),
        isNew
          ? { id: "admin.circuit.associate.success", message: "Ceremony added." }
          : { id: "admin.circuit.move.success", message: "Ceremony moved." }
      );
    },
    [detail, structural]
  );

  const removeCeremony = useCallback(
    (ceremonyId: number) =>
      structural(
        "Removing a ceremony and its mappings",
        (base) => fetchJson(`${base}/ceremonies/${ceremonyId}`, { method: "DELETE" }),
        { id: "admin.circuit.remove.success", message: "Ceremony removed." }
      ),
    [structural]
  );

  const createEvent = useCallback(
    (name: string, ceremonyIds: number[]) =>
      structural(
        "Grouping ceremonies into an event",
        (base) =>
          fetchJson(
            `${base}/events`,
            jsonInit("POST", { name: name.trim(), ceremony_ids: ceremonyIds })
          ),
        { id: "admin.circuit.event.create.success", message: "Event created." }
      ),
    [structural]
  );

  /** Renames change no scoring, so they need no confirmation. */
  const renameEvent = useCallback(
    (eventId: number, name: string) => {
      if (!detail) return Promise.resolve(false);
      return write(
        () =>
          fetchJson(
            `/admin/circuits/${detail.circuit.id}/events/${eventId}`,
            jsonInit("PATCH", { name: name.trim() })
          ),
        { id: "admin.circuit.event.rename.success", message: "Event renamed." }
      );
    },
    [detail, write]
  );

  const moveEvent = useCallback(
    (eventId: number, delta: -1 | 1) => {
      const order = moveInOrder(detail?.events.map((e) => e.id) ?? [], eventId, delta);
      if (!order) return Promise.resolve(false);
      return structural(
        "Reordering events",
        (base) =>
          fetchJson(`${base}/events/order`, jsonInit("PUT", { event_ids: order })),
        { id: "admin.circuit.event.order.success", message: "Events reordered." }
      );
    },
    [detail, structural]
  );

  /** Deletes an event; each of its ceremonies gets its own event again. */
  const ungroupEvent = useCallback(
    (eventId: number) =>
      structural(
        "Ungrouping an event",
        (base) => fetchJson(`${base}/events/${eventId}`, { method: "DELETE" }),
        { id: "admin.circuit.event.ungroup.success", message: "Event ungrouped." }
      ),
    [structural]
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

  const moveCategory = useCallback(
    (categoryId: number, delta: -1 | 1) => {
      const order = moveInOrder(
        detail?.categories.map((c) => c.id) ?? [],
        categoryId,
        delta
      );
      if (!order) return Promise.resolve(false);
      return structural(
        "Reordering categories",
        (base) =>
          fetchJson(`${base}/categories/order`, jsonInit("PUT", { category_ids: order })),
        { id: "admin.circuit.category.order.success", message: "Categories reordered." }
      );
    },
    [detail, structural]
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

  /** Records an unsaved mapping choice; null leaves the ceremony category unmapped. */
  const chooseMapping = useCallback(
    (categoryEditionId: number, circuitCategoryId: number | null) => {
      setMappingChoices((prev) => ({ ...prev, [categoryEditionId]: circuitCategoryId }));
    },
    []
  );

  /** Saves every shown mapping that differs from what is saved, then reloads. */
  const saveMappings = useCallback(async () => {
    if (!detail) return false;
    const changes = pendingMappingChanges(
      detail.category_editions,
      mappingChoices,
      detail.categories.map((c) => c.id)
    );
    if (changes.length === 0) return true;
    const { circuit } = detail;
    const ok = await confirmStructuralEdit({
      circuitStatus: circuit.status,
      circuitName: circuit.name,
      action: "Changing category mappings"
    });
    if (!ok) return false;
    setWorking(true);
    setStatus(null);
    for (const change of changes) {
      const path = `/admin/circuits/${circuit.id}/mappings/${change.categoryEditionId}`;
      const res =
        change.circuitCategoryId === null
          ? await fetchJson(path, { method: "DELETE" })
          : await fetchJson(
              path,
              jsonInit("PUT", { circuit_category_id: change.circuitCategoryId })
            );
      if (!res.ok) {
        setWorking(false);
        setStatus({ ok: false, message: res.error ?? "Some mappings were not saved" });
        await load();
        return false;
      }
    }
    setWorking(false);
    setMappingChoices({});
    notifySuccess("admin.circuit.mapping.success", "Mappings saved.");
    await load();
    return true;
  }, [detail, mappingChoices, load]);

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
    ceremonies,
    templates,
    mappingChoices,
    working,
    status,
    activationMissing,
    actions: {
      placeCeremony,
      removeCeremony,
      createEvent,
      renameEvent,
      moveEvent,
      ungroupEvent,
      addCategory,
      renameCategory,
      moveCategory,
      removeCategory,
      chooseMapping,
      saveMappings,
      activate
    }
  };
}
