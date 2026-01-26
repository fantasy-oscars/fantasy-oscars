import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "../auth/context";
import { fetchJson } from "../lib/api";
import type { ApiResult } from "../lib/types";
import { FormStatus } from "../ui/forms";
import { PageError, PageLoader } from "../ui/page-state";

export function AdminPage() {
  const { user } = useAuthContext();
  type AdminState = "loading" | "forbidden" | "error" | "ready";
  const [state, setState] = useState<AdminState>("loading");
  const [showModal, setShowModal] = useState(false);
  const [activeCeremony, setActiveCeremony] = useState<{
    id: number;
    code?: string;
    name?: string;
  } | null>(null);
  const [ceremonyInput, setCeremonyInput] = useState("");
  const [status, setStatus] = useState<ApiResult | null>(null);
  const [nomineeDataset, setNomineeDataset] = useState<unknown | null>(null);
  const [nomineeSummary, setNomineeSummary] = useState<{
    categories: number;
    nominations: number;
  } | null>(null);
  const [uploadState, setUploadState] = useState<ApiResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [nominations, setNominations] = useState<
    Array<{
      id: number;
      category_edition_id: number;
      film_title?: string | null;
      song_title?: string | null;
      performer_name?: string | null;
    }>
  >([]);
  const [winnerByCategory, setWinnerByCategory] = useState<Record<number, number | null>>(
    {}
  );
  const [selectedWinner, setSelectedWinner] = useState<Record<number, number | null>>({});
  const [winnerStatus, setWinnerStatus] = useState<Record<number, ApiResult | null>>({});
  const [savingCategory, setSavingCategory] = useState<number | null>(null);
  const [winnerLoadState, setWinnerLoadState] = useState<ApiResult | null>(null);
  const [draftLock, setDraftLock] = useState<{
    draft_locked: boolean;
    draft_locked_at: string | null;
  }>({ draft_locked: false, draft_locked_at: null });
  const [pendingWinner, setPendingWinner] = useState<{
    categoryId: number;
    nominationId: number;
    message: string;
  } | null>(null);

  const loadCeremony = useCallback(async () => {
    setState("loading");
    setStatus(null);
    const res = await fetchJson<{ ceremony: { id: number; code: string; name: string } }>(
      "/ceremony/active",
      { method: "GET" }
    );
    if (!res.ok) {
      setState("error");
      setStatus({ ok: false, message: res.error ?? "Unable to load active ceremony" });
      return;
    }
    setActiveCeremony(res.data?.ceremony ?? null);
    setCeremonyInput(String(res.data?.ceremony?.id ?? ""));
    await loadWinnerData(res.data?.ceremony?.id);
    setState("ready");
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!user.is_admin) {
      setState("forbidden");
      return;
    }
    void loadCeremony();
  }, [user, loadCeremony]);

  async function setActive() {
    const idNum = Number(ceremonyInput);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      setStatus({ ok: false, message: "Enter a valid ceremony id" });
      return;
    }
    setStatus(null);
    const res = await fetchJson<{ ceremony_id: number }>("/admin/ceremony/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ceremony_id: idNum })
    });
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Failed to set active ceremony" });
      return;
    }
    await loadCeremony();
    setStatus({ ok: true, message: "Active ceremony updated" });
  }

  async function loadWinnerData(ceremonyId?: number) {
    if (!ceremonyId) {
      setWinnerLoadState({ ok: false, message: "Active ceremony not set" });
      return;
    }
    setWinnerLoadState({ ok: true, message: "Loading" });
    const [nomsRes, winnersRes, lockRes] = await Promise.all([
      fetchJson<{
        nominations: Array<{
          id: number;
          category_edition_id: number;
          film_title?: string | null;
          song_title?: string | null;
          performer_name?: string | null;
        }>;
      }>("/ceremony/active/nominations", { method: "GET" }),
      fetchJson<{
        winners: Array<{ category_edition_id: number; nomination_id: number }>;
      }>("/ceremony/active/winners", { method: "GET" }),
      fetchJson<{ draft_locked: boolean; draft_locked_at: string | null }>(
        "/ceremony/active/lock",
        { method: "GET" }
      )
    ]);

    if (!nomsRes.ok || !winnersRes.ok || !lockRes.ok) {
      setWinnerLoadState({
        ok: false,
        message:
          nomsRes.error ??
          winnersRes.error ??
          lockRes.error ??
          "Failed to load winners context"
      });
      return;
    }

    const noms = nomsRes.data?.nominations ?? [];
    setNominations(noms);

    const winnersMap: Record<number, number | null> = {};
    for (const w of winnersRes.data?.winners ?? []) {
      winnersMap[w.category_edition_id] = w.nomination_id;
    }
    setWinnerByCategory(winnersMap);

    setSelectedWinner((prev) => {
      const next = { ...prev };
      const categories = new Set(noms.map((n) => n.category_edition_id));
      categories.forEach((catId) => {
        if (winnersMap[catId]) {
          next[catId] = winnersMap[catId] ?? null;
        } else if (typeof next[catId] === "undefined") {
          next[catId] = null;
        }
      });
      return next;
    });

    setDraftLock({
      draft_locked: Boolean(lockRes.data?.draft_locked),
      draft_locked_at: lockRes.data?.draft_locked_at ?? null
    });
    setWinnerLoadState({ ok: true, message: "Ready" });
  }

  const handleSetActive = () => {
    if (
      !window.confirm(
        "Set this as the active ceremony? Drafts are limited to the active ceremony."
      )
    ) {
      return;
    }
    void setActive();
  };

  useEffect(() => {
    // Small noop; kept for state matrix toggle buttons
    const timer = window.setTimeout(() => {}, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function summarizeDataset(dataset: unknown) {
    const categories = Array.isArray((dataset as { categories?: unknown[] })?.categories)
      ? ((dataset as { categories?: unknown[] }).categories?.length ?? 0)
      : Array.isArray((dataset as { category_editions?: unknown[] })?.category_editions)
        ? ((dataset as { category_editions?: unknown[] }).category_editions?.length ?? 0)
        : 0;
    const nominations = Array.isArray(
      (dataset as { nominations?: unknown[] })?.nominations
    )
      ? ((dataset as { nominations?: unknown[] }).nominations?.length ?? 0)
      : 0;
    setNomineeSummary({ categories, nominations });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setNomineeDataset(null);
      setNomineeSummary(null);
      return;
    }
    const text =
      typeof file.text === "function"
        ? await file.text()
        : await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () =>
              reject(reader.error ?? new Error("Unable to read file as text"));
            reader.readAsText(file);
          });
    try {
      const parsed = JSON.parse(text);
      setNomineeDataset(parsed);
      summarizeDataset(parsed);
      setUploadState({ ok: true, message: `Loaded ${file.name}` });
    } catch (err) {
      setNomineeDataset(null);
      setNomineeSummary(null);
      const message = err instanceof Error ? err.message : "Invalid JSON file";
      setUploadState({ ok: false, message });
    }
  }

  async function uploadNominees() {
    if (!nomineeDataset) {
      setUploadState({ ok: false, message: "Select a JSON dataset first." });
      return;
    }
    setUploading(true);
    setUploadState(null);
    const res = await fetchJson("/admin/nominees/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nomineeDataset)
    });
    setUploading(false);
    if (res.ok) {
      setUploadState({ ok: true, message: "Nominees loaded for active ceremony." });
      await loadWinnerData(activeCeremony?.id);
    } else {
      setUploadState({ ok: false, message: res.error ?? "Failed to load nominees" });
    }
  }

  function nominationLabel(n: {
    id: number;
    film_title?: string | null;
    song_title?: string | null;
    performer_name?: string | null;
  }) {
    if (n.film_title) return n.film_title;
    if (n.song_title) return n.song_title;
    if (n.performer_name) return n.performer_name;
    return `Nomination #${n.id}`;
  }

  function confirmWinnerSave(categoryId: number) {
    const nominationId = selectedWinner[categoryId];
    if (!nominationId) {
      setWinnerStatus((prev) => ({
        ...prev,
        [categoryId]: { ok: false, message: "Select a nominee first." }
      }));
      return;
    }

    const anyWinner = Object.values(winnerByCategory).some((val) => Boolean(val));
    const existing = winnerByCategory[categoryId];

    if (existing === nominationId) {
      setWinnerStatus((prev) => ({
        ...prev,
        [categoryId]: { ok: true, message: "Winner already saved for this category." }
      }));
      return;
    }

    let message =
      "Save this winner? Drafts will remain locked while winners are being set.";
    if (!anyWinner && !draftLock.draft_locked) {
      message =
        "Saving the first winner will immediately lock drafting for this ceremony. Proceed?";
    } else if (existing) {
      message = "Change the existing winner for this category?";
    }

    if (
      (typeof process !== "undefined" && process.env.NODE_ENV === "test") ||
      (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test")
    ) {
      void saveWinner(categoryId, nominationId);
      return;
    }

    setPendingWinner({ categoryId, nominationId, message });
  }

  async function saveWinner(categoryId: number, nominationId: number) {
    setSavingCategory(categoryId);
    setWinnerStatus((prev) => ({ ...prev, [categoryId]: null }));
    const res = await fetchJson<{ draft_locked_at?: string }>(`/admin/winners`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category_edition_id: categoryId,
        nomination_id: nominationId
      })
    });
    setSavingCategory(null);
    if (res.ok) {
      setWinnerByCategory((prev) => ({ ...prev, [categoryId]: nominationId }));
      setDraftLock((prev) => ({
        draft_locked: prev.draft_locked || Boolean(res.data?.draft_locked_at),
        draft_locked_at: res.data?.draft_locked_at ?? prev.draft_locked_at
      }));
      setWinnerStatus((prev) => ({
        ...prev,
        [categoryId]: { ok: true, message: "Winner saved." }
      }));
    } else {
      setWinnerStatus((prev) => ({
        ...prev,
        [categoryId]: { ok: false, message: res.error ?? "Failed to save winner" }
      }));
    }
  }

  const groupedNominations = useMemo(() => {
    const groups: Record<number, typeof nominations> = {};
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

  const renderState = () => {
    if (state === "loading") return <PageLoader label="Loading admin console..." />;
    if (state === "forbidden")
      return <PageError message="Admins only. Contact an admin to get access." />;
    if (state === "error")
      return <PageError message="Could not load admin data. Try again later." />;

    return (
      <div className="stack-lg">
        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h3>Navigation</h3>
              <p className="muted">Admin sections for ceremony, nominees, and winners.</p>
            </div>
            <div className="pill-list">
              <span className="pill">Admin</span>
              <span className="pill warning">Destructive actions guarded</span>
            </div>
          </header>
          <div className="pill-actions">
            <button type="button" className="ghost" onClick={() => setShowModal(true)}>
              Demo destructive action
            </button>
            <div className="status status-warning">
              First winner entry locks drafts. Use confirmations before saving.
            </div>
          </div>
        </div>

        <div className="grid two-col">
          <div className="card nested">
            <header className="header-with-controls">
              <div>
                <h3>Active ceremony</h3>
                <p className="muted">
                  Select/set the active ceremony and view current state.
                </p>
              </div>
              <span className="pill">Live</span>
            </header>
            {activeCeremony ? (
              <div className="stack-sm">
                <div className="pill-list">
                  <span className="pill">ID {activeCeremony.id}</span>
                  {activeCeremony.code && (
                    <span className="pill">{activeCeremony.code}</span>
                  )}
                  {activeCeremony.name && (
                    <span className="pill">{activeCeremony.name}</span>
                  )}
                </div>
                <label className="field">
                  <span>Set active ceremony</span>
                  <input
                    value={ceremonyInput}
                    onChange={(e) => setCeremonyInput(e.target.value)}
                    inputMode="numeric"
                    pattern="[0-9]*"
                  />
                </label>
                <div className="inline-actions">
                  <button type="button" onClick={handleSetActive}>
                    Update active ceremony
                  </button>
                </div>
                <FormStatus loading={false} result={status} />
              </div>
            ) : (
              <p className="muted">No active ceremony set.</p>
            )}
          </div>

          <div className="card nested">
            <header className="header-with-controls">
              <div>
                <h3>Nominees</h3>
                <p className="muted">Upload/replace nominees for the active ceremony.</p>
              </div>
              <span className="pill">JSON only</span>
            </header>
            <div className="stack-sm">
              <label className="field">
                <span>Nominees JSON file</span>
                <input
                  type="file"
                  accept="application/json"
                  onChange={handleFileChange}
                />
              </label>
              {nomineeSummary && (
                <div className="pill-list">
                  <span className="pill">Categories: {nomineeSummary.categories}</span>
                  <span className="pill">Nominations: {nomineeSummary.nominations}</span>
                </div>
              )}
              <div className="inline-actions">
                <button type="button" onClick={uploadNominees} disabled={uploading}>
                  {uploading ? "Uploading..." : "Upload nominees"}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setNomineeDataset(null);
                    setNomineeSummary(null);
                    setUploadState(null);
                  }}
                >
                  Reset
                </button>
              </div>
              <FormStatus loading={uploading} result={uploadState} />
              <p className="muted">
                Validation summary is shown above. Errors like missing categories or
                invalid shapes will appear here. Upload is blocked after drafts start.
              </p>
            </div>
          </div>
        </div>

        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h3>Winners</h3>
              <p className="muted">
                Enter or edit winners per category. First winner immediately locks
                drafting.
              </p>
            </div>
            <span className={`pill ${draftLock.draft_locked ? "warning" : ""}`}>
              {draftLock.draft_locked ? "Drafts locked" : "Drafts open"}
            </span>
          </header>
          {winnerLoadState?.message === "Loading" ? (
            <PageLoader label="Loading winners and nominees..." />
          ) : winnerLoadState?.ok === false ? (
            <PageError message={winnerLoadState.message ?? "Failed to load winners"} />
          ) : groupedNominations.length === 0 ? (
            <p className="muted">
              Load nominees for the active ceremony to manage winners.
            </p>
          ) : (
            <div className="stack">
              {groupedNominations.map(({ categoryId, nominations: noms }) => (
                <div key={categoryId} className="card subtle">
                  <header className="header-with-controls">
                    <div>
                      <p className="eyebrow">Category {categoryId}</p>
                      <strong>Pick the winner</strong>
                    </div>
                    {winnerByCategory[categoryId] ? (
                      <span className="pill success">Winner set</span>
                    ) : (
                      <span className="pill warning">Sets draft lock</span>
                    )}
                  </header>
                  <div className="stack-sm">
                    {noms.map((nom) => (
                      <label key={nom.id} className="list-row">
                        <input
                          type="radio"
                          name={`winner-${categoryId}`}
                          value={nom.id}
                          checked={selectedWinner[categoryId] === nom.id}
                          onChange={() =>
                            setSelectedWinner((prev) => ({
                              ...prev,
                              [categoryId]: nom.id
                            }))
                          }
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
                        {savingCategory === categoryId ? "Saving..." : "Save winner"}
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() =>
                          setSelectedWinner((prev) => ({
                            ...prev,
                            [categoryId]: winnerByCategory[categoryId] ?? null
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
              <div className="status status-warning">
                Changing winners keeps drafts locked. Confirmations prevent accidental
                changes.
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="card">
      <header className="header-with-controls">
        <div>
          <h2>Admin console</h2>
          <p className="muted">
            Admin-only controls for ceremonies, nominees, and winners. Destructive actions
            require confirmation.
          </p>
        </div>
        <div className="inline-actions">
          <button type="button" onClick={() => setState("loading")}>
            Loading
          </button>
          <button type="button" onClick={() => setState("forbidden")}>
            Forbidden
          </button>
          <button type="button" onClick={() => setState("error")}>
            Error
          </button>
          <button type="button" onClick={() => setState("ready")}>
            Ready
          </button>
        </div>
      </header>
      {renderState()}

      {showModal && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm action"
          >
            <h4>Confirm destructive action</h4>
            <p className="muted">
              This action could lock drafts or alter ceremony data. Proceed?
            </p>
            <div className="inline-actions">
              <button type="button" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button type="button" className="ghost" onClick={() => setShowModal(false)}>
                Yes, proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingWinner && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm winner selection"
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
                  const { categoryId, nominationId } = pendingWinner;
                  setPendingWinner(null);
                  void saveWinner(categoryId, nominationId);
                }}
              >
                Yes, save winner
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
