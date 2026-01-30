import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";
import { useCeremonyOptions } from "../../../features/admin/useCeremonyOptions";

type IconRow = {
  id: number;
  code: string;
  name?: string | null;
  asset_path?: string | null;
};
type FamilyRow = {
  id: number;
  code: string;
  name: string;
  default_unit_kind: "FILM" | "SONG" | "PERFORMANCE";
  icon_id: number;
  icon_code?: string;
};
type CategoryRow = {
  id: number;
  family_id: number;
  unit_kind: "FILM" | "SONG" | "PERFORMANCE";
  icon_id: number | null;
  sort_index: number;
  family_code: string;
  family_name: string;
  family_default_unit_kind: "FILM" | "SONG" | "PERFORMANCE";
  family_icon_id: number;
  icon_code: string;
  family_icon_code: string;
};

export function AdminCeremoniesCategoriesPage() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyId = Number(ceremonyIdRaw);
  const ceremonyOpts = useCeremonyOptions();

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ApiResult | null>(null);

  const [ceremonyStatus, setCeremonyStatus] = useState<string>("DRAFT");
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [icons, setIcons] = useState<IconRow[]>([]);

  const [familyQuery, setFamilyQuery] = useState("");
  const [familyResults, setFamilyResults] = useState<FamilyRow[]>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>("");

  const [newFamily, setNewFamily] = useState<{
    code: string;
    name: string;
    default_unit_kind: "FILM" | "SONG" | "PERFORMANCE";
    icon_id: string;
    add_to_ceremony: boolean;
  }>({
    code: "",
    name: "",
    default_unit_kind: "FILM",
    icon_id: "",
    add_to_ceremony: true
  });

  const [cloneFromId, setCloneFromId] = useState<string>("");

  const [tab, setTab] = useState<"import" | "edit">("edit");
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [expandedCategoryId, setExpandedCategoryId] = useState<number | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<FamilyRow | null>(null);

  const canEdit = ceremonyStatus === "DRAFT";

  const load = useCallback(async () => {
    if (!Number.isFinite(ceremonyId) || ceremonyId <= 0) {
      setError("Invalid ceremony id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setStatus(null);

    const [catRes, iconRes] = await Promise.all([
      fetchJson<{ ceremony: { status: string }; categories: CategoryRow[] }>(
        `/admin/ceremonies/${ceremonyId}/categories`,
        { method: "GET" }
      ),
      fetchJson<{ icons: IconRow[] }>("/admin/icons", { method: "GET" })
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

    setCeremonyStatus(catRes.data?.ceremony?.status ?? "DRAFT");
    setCategories(catRes.data?.categories ?? []);
    setIcons(iconRes.data?.icons ?? []);
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
      setStatus({ ok: false, message: res.error ?? "Search failed" });
      setFamilyResults([]);
      return;
    }
    setFamilyResults(res.data?.families ?? []);
  }, [familyQuery]);

  useEffect(() => {
    void Promise.all([load(), searchFamilies()]);
  }, [load, searchFamilies]);

  const iconCodes = useMemo(() => {
    const set = new Set<string>();
    for (const ic of icons) set.add(ic.code);
    for (const c of categories) set.add(c.icon_code);
    for (const c of categories) set.add(c.family_icon_code);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [categories, icons]);

  const removeCategory = useCallback(async (id: number) => {
    if (!window.confirm("Remove this category from the ceremony?")) return;
    setWorking(true);
    setStatus(null);
    const res = await fetchJson(`/admin/category-editions/${id}`, { method: "DELETE" });
    setWorking(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Remove failed" });
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== id));
    setStatus({ ok: true, message: "Removed" });
  }, []);

  const addCategory = useCallback(async () => {
    const familyId = Number(selectedFamilyId);
    if (!Number.isFinite(familyId) || familyId <= 0) {
      setStatus({ ok: false, message: "Pick a category template to add." });
      return;
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
      setStatus({ ok: false, message: res.error ?? "Add failed" });
      return;
    }
    setStatus({ ok: true, message: "Added" });
    await load();
    setSelectedFamilyId("");
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
        icon: iconCode
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
    setStatus({ ok: true, message: "Template created" });
    setFamilyResults((prev) => {
      const next = [created, ...prev.filter((f) => f.id !== created.id)];
      return next.slice(0, 50);
    });
    setSelectedFamilyId(String(created.id));
    setNewFamily((p) => ({ ...p, code: "", name: "" }));
    if (newFamily.add_to_ceremony && canEdit) {
      // Add the newly created template to this ceremony.
      setWorking(true);
      // Reuse the existing endpoint and then reload.
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
      setStatus({ ok: true, message: "Template created and added" });
      await load();
    }
    return true;
  }, [canEdit, ceremonyId, load, newFamily, setSelectedFamilyId]);

  const saveTemplateEdits = useCallback(
    async (next: {
      id: number;
      code: string;
      name: string;
      default_unit_kind: FamilyRow["default_unit_kind"];
      icon: string;
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
            icon: next.icon.trim()
          })
        }
      );
      setWorking(false);
      if (!res.ok) {
        setStatus({ ok: false, message: res.error ?? "Update failed" });
        return false;
      }
      setStatus({ ok: true, message: "Template updated" });
      setEditingTemplate(null);
      await Promise.all([load(), searchFamilies()]);
      return true;
    },
    [load, searchFamilies]
  );

  const cloneCategories = useCallback(async () => {
    const fromId = Number(cloneFromId);
    if (!Number.isFinite(fromId) || fromId <= 0) {
      setStatus({ ok: false, message: "Pick a ceremony to clone from." });
      return;
    }
    if (
      !window.confirm(
        "Replace this ceremony's categories by cloning from the selected ceremony?"
      )
    )
      return;
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
      return;
    }
    setStatus({ ok: true, message: `Cloned ${res.data?.inserted ?? 0} categories` });
    await load();
  }, [ceremonyId, cloneFromId, load]);

  if (loading) return <PageLoader label="Loading categories..." />;
  if (error) return <PageError message={error} />;

  return (
    <div className="stack-lg" style={{ marginTop: 16 }}>
      <div className="card nested">
        <header className="header-with-controls">
          <div>
            <h3>Categories</h3>
            <p className="muted">Define the category set for this ceremony.</p>
          </div>
          <div className="pill-list">
            <span className="pill">Ceremony status: {ceremonyStatus}</span>
            {!canEdit && <span className="pill warning">Read-only</span>}
          </div>
        </header>
        {!canEdit && (
          <div className="status status-warning" role="status">
            Categories can only be edited while the ceremony is in DRAFT.
          </div>
        )}
        <FormStatus loading={working} result={status} />
      </div>

      <div className="card nested">
        <header className="header-with-controls">
          <div>
            <h4>Mode</h4>
            <p className="muted">Clone/import a set, or add/remove categories.</p>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              className={tab === "import" ? "button" : "button ghost"}
              onClick={() => setTab("import")}
            >
              Import / clone
            </button>
            <button
              type="button"
              className={tab === "edit" ? "button" : "button ghost"}
              onClick={() => setTab("edit")}
            >
              Add / remove
            </button>
          </div>
        </header>
      </div>

      {tab === "import" ? (
        <div className="card nested">
          <header>
            <h4>Import / clone</h4>
            <p className="muted">
              Copy the category set from a previous ceremony (no linkage).
            </p>
          </header>
          <div className="inline-actions">
            <select
              value={cloneFromId}
              onChange={(e) => setCloneFromId(e.target.value)}
              disabled={!canEdit || ceremonyOpts.state !== "ready"}
            >
              <option value="">Select ceremony...</option>
              {ceremonyOpts.options
                .filter((c) => c.id !== ceremonyId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || "(Unnamed)"} {c.code ? `(${c.code})` : ""} #{c.id}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="button"
              onClick={() => void cloneCategories()}
              disabled={!canEdit || working}
            >
              Clone set
            </button>
          </div>
          <p className="muted">
            This replaces the entire set for the current ceremony. After cloning, you can
            edit the set independently.
          </p>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "1fr 2fr", gap: 16 }}>
          <div className="stack-lg">
            <div className="card nested">
              <header>
                <h4>Templates</h4>
                <p className="muted">Search templates and add them to this ceremony.</p>
              </header>
              <div className="inline-actions">
                <input
                  type="search"
                  placeholder="Search templates..."
                  value={familyQuery}
                  onChange={(e) => setFamilyQuery(e.target.value)}
                  disabled={!canEdit}
                />
                <button
                  type="button"
                  onClick={() => void searchFamilies()}
                  disabled={!canEdit}
                >
                  {familyQuery.trim() ? "Search" : "Show all"}
                </button>
              </div>
              <div className="inline-actions" style={{ marginTop: 8 }}>
                <select
                  value={selectedFamilyId}
                  onChange={(e) => setSelectedFamilyId(e.target.value)}
                  disabled={!canEdit || familyResults.length === 0}
                >
                  <option value="">Select template...</option>
                  {familyResults.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.code} — {f.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="button"
                  onClick={() => void addCategory()}
                  disabled={!canEdit || working}
                >
                  Add
                </button>
              </div>
              <button
                type="button"
                className="button ghost"
                onClick={() => setNewTemplateOpen(true)}
                disabled={working}
              >
                New template…
              </button>
            </div>
          </div>

          <div className="card nested">
            <header className="header-with-controls">
              <div>
                <h4>Current ceremony categories</h4>
                <p className="muted">
                  Short list. Remove and replace via templates if needed.
                </p>
              </div>
              <span className="pill">{categories.length} categories</span>
            </header>

            {categories.length === 0 ? (
              <div className="empty-state">
                <strong>No categories yet.</strong>
                <div className="muted" style={{ marginTop: 6 }}>
                  Clone from a prior ceremony or add templates on the left.
                </div>
              </div>
            ) : (
              <div className="list">
                {categories.map((c) => (
                  <div key={c.id} className="list-row">
                    <div>
                      <div className="inline-actions" style={{ gap: 10 }}>
                        <strong>{c.family_name}</strong>
                        <button
                          type="button"
                          className="ghost"
                          aria-label="Category details"
                          title="Details"
                          onClick={() =>
                            setExpandedCategoryId((prev) => (prev === c.id ? null : c.id))
                          }
                        >
                          i
                        </button>
                      </div>
                      {expandedCategoryId === c.id && (
                        <div className="status status-info" style={{ marginTop: 8 }}>
                          <div className="pill-list">
                            <span className="pill">Template: {c.family_code}</span>
                            <span className="pill">Type: {c.unit_kind}</span>
                            <span className="pill">
                              Icon: {c.icon_code || c.family_icon_code}
                            </span>
                            <span className="pill muted">Sort: {c.sort_index}</span>
                          </div>
                          <div className="inline-actions" style={{ marginTop: 10 }}>
                            <button
                              type="button"
                              className="button ghost"
                              onClick={() =>
                                setEditingTemplate({
                                  id: c.family_id,
                                  code: c.family_code,
                                  name: c.family_name,
                                  default_unit_kind: c.family_default_unit_kind,
                                  icon_id: c.family_icon_id,
                                  icon_code: c.family_icon_code
                                })
                              }
                              disabled={working}
                            >
                              Edit template
                            </button>
                          </div>
                          <p className="muted" style={{ marginTop: 8 }}>
                            Warning: editing a template changes it everywhere it is used.
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="pill-actions">
                      <button
                        type="button"
                        className="button danger"
                        onClick={() => void removeCategory(c.id)}
                        disabled={!canEdit || working}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {newTemplateOpen && (
        <NewTemplateModal
          working={working}
          canAddToCeremony={canEdit}
          value={newFamily}
          onChange={setNewFamily}
          onCancel={() => setNewTemplateOpen(false)}
          onSubmit={async () => {
            const ok = await createFamily();
            if (ok) setNewTemplateOpen(false);
          }}
        />
      )}

      {editingTemplate && (
        <EditTemplateModal
          working={working}
          iconCodes={iconCodes}
          initial={{
            id: editingTemplate.id,
            code: editingTemplate.code,
            name: editingTemplate.name,
            default_unit_kind: editingTemplate.default_unit_kind,
            icon: editingTemplate.icon_code ?? ""
          }}
          onCancel={() => setEditingTemplate(null)}
          onSubmit={(next) => void saveTemplateEdits(next)}
        />
      )}

      <datalist id="icon-codes">
        {iconCodes.map((code) => (
          <option key={code} value={code} />
        ))}
      </datalist>
    </div>
  );
}

function NewTemplateModal(props: {
  working: boolean;
  canAddToCeremony: boolean;
  value: {
    code: string;
    name: string;
    default_unit_kind: "FILM" | "SONG" | "PERFORMANCE";
    icon_id: string;
    add_to_ceremony: boolean;
  };
  onChange: React.Dispatch<
    React.SetStateAction<{
      code: string;
      name: string;
      default_unit_kind: "FILM" | "SONG" | "PERFORMANCE";
      icon_id: string;
      add_to_ceremony: boolean;
    }>
  >;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { working, canAddToCeremony, value, onChange, onCancel, onSubmit } = props;
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label="New template">
        <h4>New template</h4>
        <p className="muted">
          Create a category template, then add it to ceremonies as needed.
        </p>

        <div className="stack-sm">
          <label className="field">
            <span>Code</span>
            <input
              value={value.code}
              onChange={(e) => onChange((p) => ({ ...p, code: e.target.value }))}
              placeholder="oscar-best-picture"
              disabled={working}
            />
          </label>
          <label className="field">
            <span>Name</span>
            <input
              value={value.name}
              onChange={(e) => onChange((p) => ({ ...p, name: e.target.value }))}
              placeholder="Best Picture"
              disabled={working}
            />
          </label>
          <label className="field">
            <span>Default nominee type</span>
            <select
              value={value.default_unit_kind}
              onChange={(e) =>
                onChange((p) => ({
                  ...p,
                  default_unit_kind: e.target.value as FamilyRow["default_unit_kind"]
                }))
              }
              disabled={working}
            >
              <option value="FILM">Film</option>
              <option value="SONG">Song</option>
              <option value="PERFORMANCE">Performance</option>
            </select>
          </label>
          <label className="field">
            <span>Icon (text)</span>
            <input
              list="icon-codes"
              value={value.icon_id}
              onChange={(e) => onChange((p) => ({ ...p, icon_id: e.target.value }))}
              placeholder="e4eb or e4eb-i"
              disabled={working}
            />
          </label>
          <label className="field" style={{ alignItems: "center" }}>
            <span>Add to this ceremony</span>
            <input
              type="checkbox"
              checked={value.add_to_ceremony}
              onChange={(e) =>
                onChange((p) => ({ ...p, add_to_ceremony: e.target.checked }))
              }
              disabled={working || !canAddToCeremony}
            />
          </label>
        </div>

        <div className="inline-actions" style={{ marginTop: 12 }}>
          <button type="button" onClick={onCancel} disabled={working}>
            Cancel
          </button>
          <button type="button" className="button" onClick={onSubmit} disabled={working}>
            Create template
          </button>
        </div>
      </div>
    </div>
  );
}

function EditTemplateModal(props: {
  working: boolean;
  iconCodes: string[];
  initial: {
    id: number;
    code: string;
    name: string;
    default_unit_kind: FamilyRow["default_unit_kind"];
    icon: string;
  };
  onCancel: () => void;
  onSubmit: (next: {
    id: number;
    code: string;
    name: string;
    default_unit_kind: FamilyRow["default_unit_kind"];
    icon: string;
  }) => void;
}) {
  const { working, initial, onCancel, onSubmit } = props;
  const [value, setValue] = useState(initial);

  useEffect(() => {
    setValue(initial);
  }, [initial]);

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Edit template">
        <h4>Edit template</h4>
        <p className="muted">This changes the template everywhere it is used.</p>

        <div className="stack-sm">
          <label className="field">
            <span>Code</span>
            <input
              value={value.code}
              onChange={(e) => setValue((p) => ({ ...p, code: e.target.value }))}
              disabled={working}
            />
          </label>
          <label className="field">
            <span>Name</span>
            <input
              value={value.name}
              onChange={(e) => setValue((p) => ({ ...p, name: e.target.value }))}
              disabled={working}
            />
          </label>
          <label className="field">
            <span>Default nominee type</span>
            <select
              value={value.default_unit_kind}
              onChange={(e) =>
                setValue((p) => ({
                  ...p,
                  default_unit_kind: e.target.value as FamilyRow["default_unit_kind"]
                }))
              }
              disabled={working}
            >
              <option value="FILM">Film</option>
              <option value="SONG">Song</option>
              <option value="PERFORMANCE">Performance</option>
            </select>
          </label>
          <label className="field">
            <span>Icon (text)</span>
            <input
              list="icon-codes"
              value={value.icon}
              onChange={(e) => setValue((p) => ({ ...p, icon: e.target.value }))}
              placeholder="e4eb or e4eb-i"
              disabled={working}
            />
          </label>
        </div>

        <div className="inline-actions" style={{ marginTop: 12 }}>
          <button type="button" onClick={onCancel} disabled={working}>
            Cancel
          </button>
          <button
            type="button"
            className="button"
            onClick={() => onSubmit(value)}
            disabled={working}
          >
            Save template
          </button>
        </div>
      </div>
    </div>
  );
}
