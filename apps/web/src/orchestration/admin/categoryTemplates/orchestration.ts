import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { notify } from "../../../notifications";

export type CategoryTemplate = {
  id: number;
  code: string;
  name: string;
  default_unit_kind: "FILM" | "SONG" | "PERFORMANCE";
  icon_id: number;
  icon_code?: string | null;
  icon_variant?: "default" | "inverted";
};

export type CategoryTemplateDraft = {
  id?: number;
  code: string;
  name: string;
  default_unit_kind: "FILM" | "SONG" | "PERFORMANCE";
  icon: string;
  icon_variant: "default" | "inverted";
};

export function useAdminCategoryTemplatesOrchestration() {
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ApiResult | null>(null);

  const [query, setQuery] = useState("");
  const [templates, setTemplates] = useState<CategoryTemplate[]>([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorValue, setEditorValue] = useState<CategoryTemplateDraft | null>(null);
  const isEditing = Boolean(editorValue?.id);
  const didInitialLoadRef = useRef(false);

  const load = useCallback(async () => {
    if (!didInitialLoadRef.current) setLoading(true);
    else setSearching(true);
    setError(null);
    const templatesRes = await fetchJson<{ families: CategoryTemplate[] }>(
      "/admin/category-families",
      { method: "GET" }
    );
    if (!templatesRes.ok) {
      setError(templatesRes.error ?? "Unable to load templates");
      setTemplates([]);
      setLoading(false);
      setSearching(false);
      return;
    }
    setTemplates(templatesRes.data?.families ?? []);
    setLoading(false);
    setSearching(false);
    didInitialLoadRef.current = true;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = useCallback(() => {
    setStatus(null);
    setEditorValue({
      code: "",
      name: "",
      default_unit_kind: "FILM",
      icon: "trophy",
      icon_variant: "default"
    });
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((t: CategoryTemplate) => {
    setStatus(null);
    setEditorValue({
      id: t.id,
      code: t.code,
      name: t.name,
      default_unit_kind: t.default_unit_kind,
      icon: t.icon_code ?? "",
      icon_variant: t.icon_variant ?? "default"
    });
    setEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditorValue(null);
  }, []);

  const save = useCallback(async () => {
    if (!editorValue) return false;
    setWorking(true);
    setStatus(null);

    const payload = {
      code: editorValue.code,
      name: editorValue.name,
      default_unit_kind: editorValue.default_unit_kind,
      icon: editorValue.icon,
      icon_variant: editorValue.icon_variant
    };

    const res = editorValue.id
      ? await fetchJson<{ family: CategoryTemplate }>(
          `/admin/category-families/${editorValue.id}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
          }
        )
      : await fetchJson<{ family: CategoryTemplate }>(`/admin/category-families`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });

    setWorking(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Save failed" });
      return false;
    }

    notify({
      id: editorValue.id
        ? "admin.categoryTemplates.update.success"
        : "admin.categoryTemplates.create.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: editorValue.id ? "Template updated" : "Template created"
    });

    closeEditor();
    void load();
    return true;
  }, [closeEditor, editorValue, load]);

  const remove = useCallback(
    async (id: number) => {
      setWorking(true);
      setStatus(null);
      const res = await fetchJson(`/admin/category-families/${id}`, { method: "DELETE" });
      setWorking(false);
      if (!res.ok) {
        setStatus({ ok: false, message: res.error ?? "Delete failed" });
        return false;
      }
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      notify({
        id: "admin.categoryTemplates.delete.success",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Template deleted"
      });
      return true;
    },
    [setTemplates]
  );

  const filteredTemplates = useMemo(() => {
    const sorted = [...templates].sort((a, b) => a.code.localeCompare(b.code));
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (t) => t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
    );
  }, [query, templates]);

  return {
    loading,
    searching,
    working,
    error,
    status,
    query,
    setQuery,
    templates: filteredTemplates,
    editorOpen,
    editorValue,
    setEditorValue,
    isEditing,
    openCreate,
    openEdit,
    closeEditor,
    save,
    remove,
    reload: load
  };
}

export type AdminCategoryTemplatesOrchestration = ReturnType<
  typeof useAdminCategoryTemplatesOrchestration
>;
