import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";
import type {
  AdminCeremonyCategoriesOrchestration,
  FamilyRow
} from "../../../orchestration/adminCeremoniesCategories";
import type { Dispatch, SetStateAction } from "react";

export function AdminCeremoniesCategoriesScreen(props: {
  ceremonyId: number;
  o: AdminCeremonyCategoriesOrchestration;
  onConfirmClone: () => void;
  onConfirmRemoveCategory: (categoryId: number) => void;
}) {
  const { ceremonyId, o, onConfirmClone, onConfirmRemoveCategory } = props;

  if (o.loading) return <PageLoader label="Loading categories..." />;
  if (o.error) return <PageError message={o.error} />;

  return (
    <div className="stack-lg" style={{ marginTop: 16 }}>
      <div className="card nested">
        <header className="header-with-controls">
          <div>
            <h3>Categories</h3>
            <p className="muted">Define the category set for this ceremony.</p>
          </div>
          <div className="pill-list">
            <span className="pill">Ceremony status: {o.ceremonyStatus}</span>
            {!o.canEdit ? <span className="pill warning">Read-only</span> : null}
          </div>
        </header>
        {!o.canEdit ? (
          <div className="status status-warning" role="status">
            Categories can only be edited while the ceremony is in DRAFT.
          </div>
        ) : null}
        <FormStatus loading={o.working} result={o.status} />
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
              className={o.tab === "import" ? "button" : "button ghost"}
              onClick={() => o.setTab("import")}
            >
              Import / clone
            </button>
            <button
              type="button"
              className={o.tab === "edit" ? "button" : "button ghost"}
              onClick={() => o.setTab("edit")}
            >
              Add / remove
            </button>
          </div>
        </header>
      </div>

      {o.tab === "import" ? (
        <div className="card nested">
          <header>
            <h4>Import / clone</h4>
            <p className="muted">
              Copy the category set from a previous ceremony (no linkage).
            </p>
          </header>
          <div className="inline-actions">
            <select
              value={o.cloneFromId}
              onChange={(e) => o.setCloneFromId(e.target.value)}
              disabled={!o.canEdit}
            >
              <option value="">Select ceremony...</option>
              {o.ceremonyOptions
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
              onClick={onConfirmClone}
              disabled={!o.canEdit || o.working}
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
                  value={o.familyQuery}
                  onChange={(e) => o.setFamilyQuery(e.target.value)}
                  disabled={!o.canEdit}
                />
                <button
                  type="button"
                  onClick={() => void o.actions.searchFamilies()}
                  disabled={!o.canEdit}
                >
                  {o.familyQuery.trim() ? "Search" : "Show all"}
                </button>
              </div>
              <div className="inline-actions" style={{ marginTop: 8 }}>
                <select
                  value={o.selectedFamilyId}
                  onChange={(e) => o.setSelectedFamilyId(e.target.value)}
                  disabled={!o.canEdit || o.familyResults.length === 0}
                >
                  <option value="">Select template...</option>
                  {o.familyResults.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.code} — {f.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="button"
                  onClick={() => void o.actions.addCategory()}
                  disabled={!o.canEdit || o.working}
                >
                  Add
                </button>
              </div>
              <button
                type="button"
                className="button ghost"
                onClick={o.openNewTemplate}
                disabled={o.working}
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
              <span className="pill">{o.categories.length} categories</span>
            </header>

            {o.categories.length === 0 ? (
              <div className="empty-state">
                <strong>No categories yet.</strong>
                <div className="muted" style={{ marginTop: 6 }}>
                  Clone from a prior ceremony or add templates on the left.
                </div>
              </div>
            ) : (
              <div className="list">
                {o.categories.map((c) => (
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
                            o.setExpandedCategoryId((prev) =>
                              prev === c.id ? null : c.id
                            )
                          }
                        >
                          i
                        </button>
                      </div>
                      {o.expandedCategoryId === c.id ? (
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
                                o.setEditingTemplate({
                                  id: c.family_id,
                                  code: c.family_code,
                                  name: c.family_name,
                                  default_unit_kind: c.family_default_unit_kind,
                                  icon_id: c.family_icon_id,
                                  icon_code: c.family_icon_code
                                })
                              }
                              disabled={o.working}
                            >
                              Edit template
                            </button>
                          </div>
                          <p className="muted" style={{ marginTop: 8 }}>
                            Warning: editing a template changes it everywhere it is used.
                          </p>
                        </div>
                      ) : null}
                    </div>
                    <div className="pill-actions">
                      <button
                        type="button"
                        className="button danger"
                        onClick={() => onConfirmRemoveCategory(c.id)}
                        disabled={!o.canEdit || o.working}
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

      {o.newTemplateOpen ? (
        <NewTemplateModal
          working={o.working}
          canAddToCeremony={o.canEdit}
          value={o.newFamily}
          onChange={o.setNewFamily}
          onCancel={o.closeNewTemplate}
          onSubmit={async () => {
            const ok = await o.actions.createFamily();
            if (ok) o.closeNewTemplate();
          }}
        />
      ) : null}

      {o.editingTemplate && o.editTemplateValue ? (
        <EditTemplateModal
          working={o.working}
          iconCodes={o.iconCodes}
          value={o.editTemplateValue}
          onChange={o.setEditTemplateValue}
          onCancel={o.actions.closeEditTemplate}
          onSubmit={(next) => void o.actions.saveTemplateEdits(next)}
        />
      ) : null}

      <datalist id="icon-codes">
        {o.iconCodes.map((code) => (
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
  onChange: Dispatch<
    SetStateAction<{
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
  value: {
    id: number;
    code: string;
    name: string;
    default_unit_kind: FamilyRow["default_unit_kind"];
    icon: string;
  };
  onChange: Dispatch<
    SetStateAction<{
      id: number;
      code: string;
      name: string;
      default_unit_kind: FamilyRow["default_unit_kind"];
      icon: string;
    } | null>
  >;
  onCancel: () => void;
  onSubmit: (next: {
    id: number;
    code: string;
    name: string;
    default_unit_kind: FamilyRow["default_unit_kind"];
    icon: string;
  }) => void;
}) {
  const { working, value, onChange, onCancel, onSubmit } = props;

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
              onChange={(e) => onChange((p) => (p ? { ...p, code: e.target.value } : p))}
              disabled={working}
            />
          </label>
          <label className="field">
            <span>Name</span>
            <input
              value={value.name}
              onChange={(e) => onChange((p) => (p ? { ...p, name: e.target.value } : p))}
              disabled={working}
            />
          </label>
          <label className="field">
            <span>Default nominee type</span>
            <select
              value={value.default_unit_kind}
              onChange={(e) =>
                onChange((p) =>
                  p
                    ? {
                        ...p,
                        default_unit_kind: e.target
                          .value as FamilyRow["default_unit_kind"]
                      }
                    : p
                )
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
              onChange={(e) => onChange((p) => (p ? { ...p, icon: e.target.value } : p))}
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
