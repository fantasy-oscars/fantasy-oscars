import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";
import type { ApiResult } from "../../../lib/types";

type WinnersNomination = {
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

export function AdminCeremoniesWinnersScreen(props: {
  loading: boolean;
  loadState: ApiResult | null;
  groupedNominations: Array<{
    categoryId: number;
    nominations: WinnersNomination[];
  }>;
  selectedWinner: Record<number, number[]>;
  toggleNomination: (categoryId: number, nominationId: number, checked: boolean) => void;
  resetCategory: (categoryId: number) => void;
  winnerByCategory: Record<number, number[]>;
  winnerStatus: Record<number, ApiResult | null>;
  savingCategory: number | null;
  draftLock: { draft_locked: boolean; draft_locked_at: string | null };
  nominationLabel: (n: WinnersNomination) => string;
  pendingWinner: { categoryId: number; nominationIds: number[]; message: string } | null;
  dismissPendingWinner: () => void;
  requestSaveWinners: (categoryId: number) => void;
  confirmPendingWinner: () => void;
}) {
  const {
    loading,
    loadState,
    groupedNominations,
    selectedWinner,
    toggleNomination,
    resetCategory,
    winnerByCategory,
    winnerStatus,
    savingCategory,
    draftLock,
    nominationLabel,
    pendingWinner,
    dismissPendingWinner,
    requestSaveWinners,
    confirmPendingWinner
  } = props;

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
        {draftLock.draft_locked_at ? (
          <p className="muted">
            Locked at {new Date(draftLock.draft_locked_at).toLocaleString()}
          </p>
        ) : null}
        <div className="status status-warning">
          First winner entry locks drafts. Changing winners keeps drafts locked.
        </div>
      </div>

      {groupedNominations.length === 0 ? (
        <PageError message="No nominees loaded. Add nominees for this ceremony first." />
      ) : (
        <div className="stack-lg">
          {groupedNominations.map(({ categoryId, nominations }) => (
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
                  (winnerByCategory[categoryId] ?? []).length === 0 ? (
                    <span className="pill warning">Will lock drafts</span>
                  ) : null}
                </div>
              </header>
              <div className="stack-sm">
                {nominations.map((nom) => (
                  <label key={nom.id} className="list-row">
                    <input
                      type="checkbox"
                      checked={(selectedWinner[categoryId] ?? []).includes(nom.id)}
                      onChange={(e) =>
                        toggleNomination(categoryId, nom.id, e.target.checked)
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
                    onClick={() => requestSaveWinners(categoryId)}
                    disabled={savingCategory === categoryId}
                  >
                    {savingCategory === categoryId ? "Saving..." : "Save winners"}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => resetCategory(categoryId)}
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

      {pendingWinner ? (
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
              <button type="button" onClick={dismissPendingWinner}>
                Cancel
              </button>
              <button type="button" className="ghost" onClick={confirmPendingWinner}>
                Yes, save winners
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
