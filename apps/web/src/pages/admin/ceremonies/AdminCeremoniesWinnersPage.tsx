import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";

type NominationRow = {
  id: number;
  category_edition_id: number;
  film_title?: string | null;
  song_title?: string | null;
  performer_name?: string | null;
  contributors?: Array<{
    person_id: number;
    full_name: string;
    role_label: string | null;
    sort_order: number;
  }>;
};

function nominationLabel(n: NominationRow) {
  const people =
    Array.isArray(n.contributors) && n.contributors.length > 0
      ? n.contributors.map((c) => c.full_name)
      : n.performer_name
        ? [n.performer_name]
        : [];
  const peopleLabel =
    people.length > 0
      ? `${people[0]}${people.length > 1 ? ` +${people.length - 1}` : ""}`
      : "";
  if (n.song_title)
    return peopleLabel ? `${n.song_title} — ${peopleLabel}` : n.song_title;
  if (peopleLabel) return n.film_title ? `${peopleLabel} — ${n.film_title}` : peopleLabel;
  return n.film_title ?? `Nomination #${n.id}`;
}

export function AdminCeremoniesWinnersPage() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyId = Number(ceremonyIdRaw);

  const [loading, setLoading] = useState(true);
  const [loadState, setLoadState] = useState<ApiResult | null>(null);
  const [nominations, setNominations] = useState<NominationRow[]>([]);
  const [winnerByCategory, setWinnerByCategory] = useState<Record<number, number[]>>({});
  const [selectedWinner, setSelectedWinner] = useState<Record<number, number[]>>({});
  const [winnerStatus, setWinnerStatus] = useState<Record<number, ApiResult | null>>({});
  const [savingCategory, setSavingCategory] = useState<number | null>(null);
  const [draftLock, setDraftLock] = useState<{
    draft_locked: boolean;
    draft_locked_at: string | null;
  }>({
    draft_locked: false,
    draft_locked_at: null
  });
  const [pendingWinner, setPendingWinner] = useState<{
    categoryId: number;
    nominationIds: number[];
    message: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(ceremonyId) || ceremonyId <= 0) {
      setLoadState({ ok: false, message: "Invalid ceremony id" });
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadState({ ok: true, message: "Loading" });
    const [nomsRes, winnersRes, lockRes] = await Promise.all([
      fetchJson<{ nominations: NominationRow[] }>(
        `/admin/ceremonies/${ceremonyId}/nominations`,
        {
          method: "GET"
        }
      ),
      fetchJson<{
        winners: Array<{ category_edition_id: number; nomination_id: number }>;
      }>(`/admin/ceremonies/${ceremonyId}/winners`, { method: "GET" }),
      fetchJson<{
        draft_locked: boolean;
        draft_locked_at: string | null;
        status: string;
      }>(`/admin/ceremonies/${ceremonyId}/lock`, { method: "GET" })
    ]);

    if (!nomsRes.ok || !winnersRes.ok || !lockRes.ok) {
      setLoadState({
        ok: false,
        message:
          nomsRes.error ??
          winnersRes.error ??
          lockRes.error ??
          "Failed to load winners context"
      });
      setLoading(false);
      return;
    }

    const noms = nomsRes.data?.nominations ?? [];
    setNominations(noms);

    const winnersMap: Record<number, number[]> = {};
    for (const w of winnersRes.data?.winners ?? []) {
      winnersMap[w.category_edition_id] = winnersMap[w.category_edition_id] ?? [];
      winnersMap[w.category_edition_id].push(w.nomination_id);
    }
    setWinnerByCategory(winnersMap);
    setSelectedWinner((prev) => {
      const next = { ...prev };
      const categories = new Set(noms.map((n) => n.category_edition_id));
      categories.forEach((catId) => {
        if (winnersMap[catId]?.length) next[catId] = winnersMap[catId];
        else if (typeof next[catId] === "undefined") next[catId] = [];
      });
      return next;
    });

    setDraftLock({
      draft_locked: Boolean(lockRes.data?.draft_locked),
      draft_locked_at: lockRes.data?.draft_locked_at ?? null
    });

    setLoadState({ ok: true, message: "Ready" });
    setLoading(false);
  }, [ceremonyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const groupedNominations = useMemo(() => {
    const groups: Record<number, NominationRow[]> = {};
    for (const n of nominations) {
      groups[n.category_edition_id] = groups[n.category_edition_id] ?? [];
      groups[n.category_edition_id].push(n);
    }
    return Object.entries(groups)
      .map(([categoryId, noms]) => ({
        categoryId: Number(categoryId),
        nominations: noms
      }))
      .sort((a, b) => a.categoryId - b.categoryId);
  }, [nominations]);

  const confirmWinnerSave = useCallback(
    (categoryId: number) => {
      const nominationIds = selectedWinner[categoryId] ?? [];
      if (nominationIds.length === 0) {
        setWinnerStatus((prev) => ({
          ...prev,
          [categoryId]: { ok: false, message: "Pick a nomination first" }
        }));
        return;
      }
      const anyWinner = Object.values(winnerByCategory).some(
        (val) => (val ?? []).length > 0
      );
      const existing = winnerByCategory[categoryId] ?? [];

      let message =
        "Save this winner? Drafts will remain locked while winners are being set.";
      if (!anyWinner && !draftLock.draft_locked) {
        message =
          "Saving the first winner will immediately lock drafting for this ceremony. Proceed?";
      } else if (existing.length > 0) {
        message = "Update winners for this category?";
      }

      setPendingWinner({ categoryId, nominationIds, message });
    },
    [draftLock.draft_locked, selectedWinner, winnerByCategory]
  );

  const saveWinner = useCallback(async (categoryId: number, nominationIds: number[]) => {
    setSavingCategory(categoryId);
    setWinnerStatus((prev) => ({ ...prev, [categoryId]: null }));
    const res = await fetchJson<{ draft_locked_at?: string; cancelled_drafts?: number }>(
      "/admin/winners",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_edition_id: categoryId,
          nomination_ids: nominationIds
        })
      }
    );
    setSavingCategory(null);
    if (!res.ok) {
      setWinnerStatus((prev) => ({
        ...prev,
        [categoryId]: { ok: false, message: res.error ?? "Failed to save winner" }
      }));
      return;
    }
    setWinnerByCategory((prev) => ({ ...prev, [categoryId]: nominationIds }));
    setDraftLock((prev) => ({
      draft_locked: prev.draft_locked || Boolean(res.data?.draft_locked_at),
      draft_locked_at: res.data?.draft_locked_at ?? prev.draft_locked_at
    }));
    setWinnerStatus((prev) => ({
      ...prev,
      [categoryId]: { ok: true, message: "Saved" }
    }));
  }, []);

  if (loading && loadState?.message === "Loading")
    return <PageLoader label="Loading winners..." />;
  if (loadState?.ok === false) return <PageError message={loadState.message} />;

  return (
    <div className="stack-lg" style={{ marginTop: 16 }}>
      <div className="card nested">
        <header className="header-with-controls">
          <div>
            <h3>Winners</h3>
            <p className="muted">Enter or edit winners per category for this ceremony.</p>
          </div>
          <div className="pill-list">
            <span className={`pill ${draftLock.draft_locked ? "warning" : ""}`}>
              {draftLock.draft_locked ? "Drafts locked" : "Drafts open"}
            </span>
          </div>
        </header>
        {draftLock.draft_locked_at && (
          <p className="muted">
            Locked at {new Date(draftLock.draft_locked_at).toLocaleString()}
          </p>
        )}
        <div className="status status-warning">
          First winner entry locks drafts. Changing winners keeps drafts locked.
        </div>
      </div>

      {groupedNominations.length === 0 ? (
        <PageError message="No nominees loaded. Add nominees for this ceremony first." />
      ) : (
        <div className="stack-lg">
          {groupedNominations.map(({ categoryId, nominations: noms }) => (
            <div key={categoryId} className="card nested">
              <header className="header-with-controls">
                <div>
                  <h4>Category {categoryId}</h4>
                  <p className="muted">Pick the winner</p>
                </div>
                <div className="pill-list">
                  {(winnerByCategory[categoryId] ?? []).length > 0 ? (
                    <span className="pill success">Winner set</span>
                  ) : (
                    <span className="pill muted">Unset</span>
                  )}
                  {!draftLock.draft_locked &&
                    (winnerByCategory[categoryId] ?? []).length === 0 && (
                      <span className="pill warning">Will lock drafts</span>
                    )}
                </div>
              </header>
              <div className="stack-sm">
                {noms.map((nom) => (
                  <label key={nom.id} className="list-row">
                    <input
                      type="checkbox"
                      checked={(selectedWinner[categoryId] ?? []).includes(nom.id)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelectedWinner((prev) => {
                          const current = prev[categoryId] ?? [];
                          const nextSet = new Set(current);
                          if (checked) nextSet.add(nom.id);
                          else nextSet.delete(nom.id);
                          return { ...prev, [categoryId]: Array.from(nextSet) };
                        });
                      }}
                    />
                    <div>
                      <p className="eyebrow">Nomination #{nom.id}</p>
                      <strong>{nominationLabel(nom)}</strong>
                    </div>
                  </label>
                ))}
                <div className="inline-actions">
                  <button
                    type="button"
                    onClick={() => confirmWinnerSave(categoryId)}
                    disabled={savingCategory === categoryId}
                  >
                    {savingCategory === categoryId ? "Saving..." : "Save winners"}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      setSelectedWinner((prev) => ({
                        ...prev,
                        [categoryId]: winnerByCategory[categoryId] ?? []
                      }))
                    }
                  >
                    Reset
                  </button>
                </div>
                <FormStatus
                  loading={savingCategory === categoryId}
                  result={winnerStatus[categoryId] ?? null}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingWinner && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm winner"
          >
            <h4>Confirm winner</h4>
            <p className="muted">{pendingWinner.message}</p>
            <div className="inline-actions">
              <button type="button" onClick={() => setPendingWinner(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  const { categoryId, nominationIds } = pendingWinner;
                  setPendingWinner(null);
                  void saveWinner(categoryId, nominationIds);
                }}
              >
                Yes, save winners
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
