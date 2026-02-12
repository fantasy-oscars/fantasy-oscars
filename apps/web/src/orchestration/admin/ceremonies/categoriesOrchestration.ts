import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { notify } from "../../../notifications";
import type { CeremonyOption } from "./types";
import { fetchAdminCeremonies, sortCeremonies } from "./fetchCeremonies";
import type { CategoryRow, FamilyRow, IconRow } from "../ceremonyCategories/types";

export function useAdminCeremonyCategoriesOrchestration(args: {
  ceremonyId: number | null;
}) {
  const { ceremonyId } = args;

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ApiResult | null>(null);

  const [ceremonyStatus, setCeremonyStatus] = useState<string>("DRAFT");
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [icons, setIcons] = useState<IconRow[]>([]);
  const [ceremonyOptionsRaw, setCeremonyOptionsRaw] = useState<CeremonyOption[]>([]);

  const [familyQuery, setFamilyQuery] = useState("");
  const [familyResults, setFamilyResults] = useState<FamilyRow[]>([]);
  const [familySearchError, setFamilySearchError] = useState<string | null>(null);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>("");

  const [newFamily, setNewFamily] = useState<{
    code: string;
    name: string;
    default_unit_kind: "FILM" | "SONG" | "PERFORMANCE";
    icon_id: string;
    icon_variant: "default" | "inverted";
    add_to_ceremony: boolean;
  }>({
    code: "",
    name: "",
    default_unit_kind: "FILM",
    icon_id: "trophy",
    icon_variant: "default",
    add_to_ceremony: true
  });

  const [cloneFromId, setCloneFromId] = useState<string>("");

  const [tab, setTab] = useState<"import" | "edit">("edit");
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [expandedCategoryId, setExpandedCategoryId] = useState<number | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<FamilyRow | null>(null);
  const [editTemplateValue, setEditTemplateValue] = useState<{
    id: number;
    code: string;
    name: string;
    default_unit_kind: FamilyRow["default_unit_kind"];
    icon: string;
    icon_variant: "default" | "inverted";
  } | null>(null);

  const canEdit = ceremonyStatus === "DRAFT";

  const load = useCallback(async () => {
    if (ceremonyId === null || !Number.isFinite(ceremonyId) || ceremonyId <= 0) {
      setError("Invalid ceremony id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setStatus(null);

    const [catRes, iconRes, cerRes] = await Promise.all([
      fetchJson<{ ceremony: { status: string }; categories: CategoryRow[] }>(
        `/admin/ceremonies/${ceremonyId}/categories`,
        { method: "GET" }
      ),
      fetchJson<{ icons: IconRow[] }>("/admin/icons", { method: "GET" }),
      fetchAdminCeremonies()
    ]);

    if (!catRes.ok) {
      setError(catRes.error ?? "Unable to load categories");
      setLoading(false);
      return;
    }
    if (!iconRes.ok) {
      setError(iconRes.error ?? "Unable to load icons");
      setLoading(false);
      return;
    }
    if (!cerRes.ok) {
      setError(cerRes.error ?? "Unable to load ceremonies");
      setLoading(false);
      return;
    }

    setCeremonyStatus(catRes.data?.ceremony?.status ?? "DRAFT");
    setCategories(catRes.data?.categories ?? []);
    setIcons(iconRes.data?.icons ?? []);
    setCeremonyOptionsRaw(cerRes.data?.ceremonies ?? []);
    setLoading(false);
  }, [ceremonyId]);

  const searchFamilies = useCallback(async () => {
    const q = familyQuery.trim();
    const res = await fetchJson<{ families: FamilyRow[] }>(
      q
        ? `/admin/category-families?q=${encodeURIComponent(q)}`
        : `/admin/category-families`,
      { method: "GET" }
    );
    if (!res.ok) {
      // "No results" should not be treated as an error in UI.
      if (res.errorCode === "NOT_FOUND") {
        setFamilyResults([]);
        setFamilySearchError(null);
        return;
      }
      setFamilyResults([]);
      setFamilySearchError(res.error ?? "Search failed");
      return;
    }
    setFamilyResults(res.data?.families ?? []);
    setFamilySearchError(null);
  }, [familyQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void searchFamilies();
  }, [searchFamilies]);

  useEffect(() => {
    if (!editingTemplate) {
      setEditTemplateValue(null);
      return;
    }
    setEditTemplateValue({
      id: editingTemplate.id,
      code: editingTemplate.code,
      name: editingTemplate.name,
      default_unit_kind: editingTemplate.default_unit_kind,
      icon: editingTemplate.icon_code ?? "",
      icon_variant: editingTemplate.icon_variant ?? "default"
    });
  }, [editingTemplate]);

  const ceremonyOptions = useMemo(
    () => sortCeremonies(ceremonyOptionsRaw),
    [ceremonyOptionsRaw]
  );

  const iconCodes = useMemo(() => {
    const set = new Set<string>();
    for (const ic of icons) set.add(ic.code);
    for (const c of categories) set.add(c.icon_code);
    for (const c of categories) set.add(c.family_icon_code);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [categories, icons]);

  const removeCategory = useCallback(async (id: number) => {
    setWorking(true);
    setStatus(null);
    const res = await fetchJson(`/admin/category-editions/${id}`, { method: "DELETE" });
    setWorking(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Remove failed" });
      return false;
    }
    setCategories((prev) => prev.filter((c) => c.id !== id));
    notify({
      id: "admin.categories.remove.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Removed"
    });
    setStatus(null);
    return true;
  }, []);

  const addCategory = useCallback(async () => {
    if (ceremonyId === null) return false;
    const familyId = Number(selectedFamilyId);
    if (!Number.isFinite(familyId) || familyId <= 0) {
      setStatus({ ok: false, message: "Pick a category template to add." });
      return false;
    }
    setWorking(true);
    setStatus(null);
    const res = await fetchJson<{ category: { id: number } }>(
      `/admin/ceremonies/${ceremonyId}/categories`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ family_id: familyId })
      }
    );
    setWorking(false);
    if (!res.ok) {
      const msg = res.error ?? "Add failed";
      if (msg === "Category already exists in ceremony") {
        notify({
          id: "admin.categories.add.duplicate",
          severity: "error",
          trigger_type: "user_action",
          scope: "local",
          durability: "ephemeral",
          requires_decision: false,
          message: msg
        });
        setStatus(null);
        return false;
      }
      setStatus({ ok: false, message: msg });
      return false;
    }
    notify({
      id: "admin.categories.add.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Added"
    });
    setStatus(null);
    await load();
    setSelectedFamilyId("");
    return true;
  }, [ceremonyId, load, selectedFamilyId]);

  const createFamily = useCallback(async (): Promise<boolean> => {
    const code = newFamily.code.trim();
    const name = newFamily.name.trim();
    if (!code || !name) {
      setStatus({ ok: false, message: "Code and name are required." });
      return false;
    }
    const iconCode = newFamily.icon_id.trim();
    if (!iconCode) {
      setStatus({ ok: false, message: "Icon code is required." });
      return false;
    }

    setWorking(true);
    setStatus(null);
    const res = await fetchJson<{ family: FamilyRow }>("/admin/category-families", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        name,
        default_unit_kind: newFamily.default_unit_kind,
        icon: iconCode,
        icon_variant: newFamily.icon_variant
      })
    });
    setWorking(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Create failed" });
      return false;
    }
    const created = res.data?.family;
    if (!created) {
      setStatus({ ok: false, message: "Create failed" });
      return false;
    }
    notify({
      id: "admin.category_template.create.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Template created"
    });
    setStatus(null);
    setFamilyResults((prev) => {
      const next = [created, ...prev.filter((f) => f.id !== created.id)];
      return next.slice(0, 50);
    });
    setSelectedFamilyId(String(created.id));
    setNewFamily((p) => ({ ...p, code: "", name: "" }));
    if (newFamily.add_to_ceremony && canEdit && ceremonyId !== null) {
      setWorking(true);
      const addRes = await fetchJson<{ category: { id: number } }>(
        `/admin/ceremonies/${ceremonyId}/categories`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ family_id: created.id })
        }
      );
      setWorking(false);
      if (!addRes.ok) {
        setStatus({
          ok: false,
          message: addRes.error ?? "Template created, but failed to add to ceremony"
        });
        return false;
      }
      notify({
        id: "admin.category_template.create_and_add.success",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Template created and added"
      });
      setStatus(null);
      await load();
    }
    return true;
  }, [canEdit, ceremonyId, load, newFamily]);

  const saveTemplateEdits = useCallback(
    async (next: {
      id: number;
      code: string;
      name: string;
      default_unit_kind: FamilyRow["default_unit_kind"];
      icon: string;
      icon_variant?: "default" | "inverted";
    }) => {
      setWorking(true);
      setStatus(null);
      const res = await fetchJson<{ family: FamilyRow }>(
        `/admin/category-families/${next.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: next.code.trim(),
            name: next.name.trim(),
            default_unit_kind: next.default_unit_kind,
            icon: next.icon.trim(),
            icon_variant: next.icon_variant
          })
        }
      );
      setWorking(false);
      if (!res.ok) {
        setStatus({ ok: false, message: res.error ?? "Update failed" });
        return false;
      }
      notify({
        id: "admin.category_template.update.success",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Template updated"
      });
      setStatus(null);
      setEditingTemplate(null);
      await Promise.all([load(), searchFamilies()]);
      return true;
    },
    [load, searchFamilies]
  );

  const cloneCategories = useCallback(async () => {
    if (ceremonyId === null) return false;
    const fromId = Number(cloneFromId);
    if (!Number.isFinite(fromId) || fromId <= 0) {
      setStatus({ ok: false, message: "Pick a ceremony to clone from." });
      return false;
    }
    setWorking(true);
    setStatus(null);
    const res = await fetchJson<{ inserted: number }>(
      `/admin/ceremonies/${ceremonyId}/categories/clone`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_ceremony_id: fromId })
      }
    );
    setWorking(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Clone failed" });
      return false;
    }
    notify({
      id: "admin.categories.clone.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: `Cloned ${res.data?.inserted ?? 0} categories`
    });
    setStatus(null);
    await load();
    return true;
  }, [ceremonyId, cloneFromId, load]);

  const setCategoryIcon = useCallback(
    async (categoryId: number, icon: string) => {
      setWorking(true);
      setStatus(null);
      const res = await fetchJson(`/admin/category-editions/${categoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icon })
      });
      setWorking(false);
      if (!res.ok) {
        setStatus({ ok: false, message: res.error ?? "Update failed" });
        return false;
      }
      notify({
        id: "admin.category_icon.update.success",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Updated"
      });
      setStatus(null);
      await load();
      return true;
    },
    [load]
  );

  const reorderCategories = useCallback(
    async (categoryIds: number[]) => {
      if (ceremonyId === null) return false;
      if (!Array.isArray(categoryIds) || categoryIds.length < 1) return false;

      setWorking(true);
      setStatus(null);
      const res = await fetchJson(`/admin/ceremonies/${ceremonyId}/categories/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_ids: categoryIds })
      });
      setWorking(false);
      if (!res.ok) {
        setStatus({ ok: false, message: res.error ?? "Failed to reorder categories" });
        return false;
      }
      notify({
        id: "admin.categories.reorder.success",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Reordered"
      });
      setStatus(null);

      // Update local order immediately without forcing a reload.
      setCategories((prev) => {
        const byId = new Map(prev.map((c) => [c.id, c]));
        const next: CategoryRow[] = [];
        const idSet = new Set<number>(categoryIds);
        for (let i = 0; i < categoryIds.length; i += 1) {
          const c = byId.get(categoryIds[i]);
          if (c) next.push({ ...c, sort_index: i + 1 });
        }
        // Keep any unexpected rows at the end.
        for (const c of prev) if (!idSet.has(c.id)) next.push(c);
        return next;
      });
      return true;
    },
    [ceremonyId]
  );

  const closeNewTemplate = useCallback(() => setNewTemplateOpen(false), []);
  const openNewTemplate = useCallback(() => setNewTemplateOpen(true), []);

  const closeEditTemplate = useCallback(() => setEditingTemplate(null), []);

  return {
    loading,
    working,
    error,
    status,
    ceremonyStatus,
    canEdit,
    categories,
    icons,
    ceremonyOptions,
    familyQuery,
    setFamilyQuery,
    familyResults,
    familySearchError,
    selectedFamilyId,
    setSelectedFamilyId,
    newFamily,
    setNewFamily,
    cloneFromId,
    setCloneFromId,
    tab,
    setTab,
    newTemplateOpen,
    openNewTemplate,
    closeNewTemplate,
    expandedCategoryId,
    setExpandedCategoryId,
    editingTemplate,
    setEditingTemplate,
    editTemplateValue,
    setEditTemplateValue,
    iconCodes,
    actions: {
      load,
      searchFamilies,
      removeCategory,
      addCategory,
      createFamily,
      saveTemplateEdits,
      cloneCategories,
      setCategoryIcon,
      reorderCategories,
      closeEditTemplate
    }
  };
}

export type AdminCeremonyCategoriesOrchestration = ReturnType<
  typeof useAdminCeremonyCategoriesOrchestration
>;
