import { formatFilmTitleWithYear } from "../../../lib/films";
import type { AdminCeremonyNomineesOrchestration } from "../../../orchestration/adminCeremoniesNominees";
import { FormStatus } from "../../../ui/forms";

export function AdminCeremoniesNomineesScreen(props: {
  o: AdminCeremonyNomineesOrchestration;
}) {
  const { o } = props;

  const {
    tab,
    setTab,
    candidateUploading,
    candidateUploadState,
    candidateSummaryView,
    manualLoading,
    manualState,
    categories,
    films,
    nominations,
    nominationsLoading,
    selectedCategoryId,
    setSelectedCategoryId,
    selectedCategory,
    filmInput,
    songTitle,
    setSongTitle,
    creditsLoading,
    creditsState,
    creditOptions,
    creditQuery,
    setCreditQuery,
    filteredCreditOptions,
    selectedContributorIds,
    setSelectedContributorIds,
    pendingContributorId,
    setPendingContributorId,
    selectedCredits,
    categoryLabelById
  } = o;

  const {
    onCandidateFileChange,
    resetCandidates,
    resetManual,
    resolveFilmSelection,
    uploadCandidateFilms,
    createNomination,
    deleteNomination
  } = o.actions;

  return (
    <div className="stack-lg" style={{ marginTop: 16 }}>
      <div className="card nested">
        <header className="header-with-controls">
          <div>
            <h3>Nominees</h3>
            <p className="muted">
              Candidates, nomination entry, and current nominee list for this ceremony.
            </p>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              className={tab === "candidates" ? "" : "ghost"}
              onClick={() => setTab("candidates")}
            >
              Candidates
            </button>
            <button
              type="button"
              className={tab === "add" ? "" : "ghost"}
              onClick={() => setTab("add")}
            >
              Add nominees
            </button>
            <button
              type="button"
              className={tab === "list" ? "" : "ghost"}
              onClick={() => setTab("list")}
            >
              Nominee list
            </button>
          </div>
        </header>
      </div>

      {tab === "candidates" && (
        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h3>Candidate films (TMDB import)</h3>
              <p className="muted">
                Seed an internal list of films/candidates (draft only). This does not
                require a nominees dataset.
              </p>
            </div>
            <span className="pill">JSON only</span>
          </header>

          <div className="stack-sm">
            <label className="field">
              <span>Candidate films JSON file</span>
              <input
                type="file"
                accept="application/json"
                onChange={onCandidateFileChange}
                disabled={candidateUploading}
              />
            </label>

            <div className="status status-info" role="status">
              {candidateSummaryView}
            </div>

            <div className="inline-actions">
              <button
                type="button"
                className="button"
                onClick={() => void uploadCandidateFilms()}
                disabled={candidateUploading}
              >
                {candidateUploading ? "Importing..." : "Import candidate films"}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={resetCandidates}
                disabled={candidateUploading}
              >
                Reset
              </button>
            </div>

            <FormStatus loading={candidateUploading} result={candidateUploadState} />
          </div>
        </div>
      )}

      {tab === "add" && (
        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h3>Add nominees</h3>
              <p className="muted">
                Create nominations one by one. Select category, film, then (optionally)
                contributors pulled from TMDB credits.
              </p>
            </div>
            <span className="pill">Manual</span>
          </header>

          <div className="stack-sm">
            <div className="grid two-col">
              <label className="field">
                <span>Category</span>
                <select
                  value={selectedCategoryId ? String(selectedCategoryId) : ""}
                  onChange={(e) =>
                    setSelectedCategoryId(e.target.value ? Number(e.target.value) : null)
                  }
                >
                  <option value="">Select...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.family_name ?? `Category ${c.id}`}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Film (type to search)</span>
                <input
                  list="candidate-films"
                  value={filmInput}
                  onChange={(e) => void resolveFilmSelection(e.target.value)}
                  placeholder="Type film title or id..."
                />
                <datalist id="candidate-films">
                  {films.map((f) => (
                    <option
                      key={f.id}
                      value={formatFilmTitleWithYear(f.title, f.release_year)}
                    >
                      #{f.id} {f.title}
                      {f.tmdb_id ? ` [tmdb:${f.tmdb_id}]` : ""}
                    </option>
                  ))}
                </datalist>
              </label>
            </div>

            {selectedCategory?.unit_kind === "SONG" && (
              <label className="field">
                <span>Song title</span>
                <input value={songTitle} onChange={(e) => setSongTitle(e.target.value)} />
              </label>
            )}

            <div className="card nested">
              <header className="header-with-controls">
                <div>
                  <h4>Contributors</h4>
                  <p className="muted">
                    Select from this film&apos;s stored TMDB credits. (People details are
                    not hydrated until needed.)
                  </p>
                </div>
                {selectedCategory?.unit_kind === "PERFORMANCE" ? (
                  <span className="pill">Pick 1+</span>
                ) : (
                  <span className="pill">Optional</span>
                )}
              </header>

              <div className="stack-sm">
                <FormStatus loading={creditsLoading} result={creditsState} />

                {creditOptions.length > 0 ? (
                  <div className="stack-sm">
                    <label className="field">
                      <span>Search credits</span>
                      <input
                        value={creditQuery}
                        onChange={(e) => setCreditQuery(e.target.value)}
                        placeholder="Type a name, character, job..."
                      />
                    </label>

                    <label className="field">
                      <span>Find a person</span>
                      <select
                        value={pendingContributorId}
                        size={Math.min(10, Math.max(4, filteredCreditOptions.length + 1))}
                        onChange={(e) => setPendingContributorId(e.target.value)}
                      >
                        <option value="">Select…</option>
                        {filteredCreditOptions.map((o) => (
                          <option key={o.tmdb_id} value={String(o.tmdb_id)}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="inline-actions">
                      <button
                        type="button"
                        onClick={() => {
                          const id = Number(pendingContributorId);
                          if (!Number.isFinite(id) || id <= 0) return;
                          setSelectedContributorIds((prev) =>
                            prev.includes(id) ? prev : [...prev, id]
                          );
                          setPendingContributorId("");
                        }}
                        disabled={!pendingContributorId}
                      >
                        Add person
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          setSelectedContributorIds([]);
                          setPendingContributorId("");
                        }}
                        disabled={selectedContributorIds.length === 0}
                      >
                        Clear
                      </button>
                    </div>

                    <div className="stack-sm">
                      <p className="muted">Selected people</p>
                      {selectedCredits.length === 0 ? (
                        <p className="muted">None yet.</p>
                      ) : (
                        <div className="stack-sm">
                          {selectedCredits.map((c) => (
                            <div key={c.tmdb_id} className="list-row">
                              <div>
                                <strong>{c.name}</strong>
                                <span className="muted"> — {c.jobs.join(", ")}</span>
                              </div>
                              <div className="inline-actions">
                                <button
                                  type="button"
                                  className="ghost"
                                  onClick={() =>
                                    setSelectedContributorIds((prev) =>
                                      prev.filter((id) => id !== c.tmdb_id)
                                    )
                                  }
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
                ) : (
                  <p className="muted">
                    No credits loaded. Select a film with TMDB credits (or import
                    candidates with TMDB hydration enabled).
                  </p>
                )}
              </div>
            </div>

            <div className="inline-actions">
              <button
                type="button"
                onClick={() => void createNomination()}
                disabled={manualLoading}
              >
                {manualLoading ? "Saving..." : "Add nominee"}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={resetManual}
                disabled={manualLoading}
              >
                Reset
              </button>
            </div>

            <FormStatus loading={manualLoading} result={manualState} />
          </div>
        </div>
      )}

      {tab === "list" && (
        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h3>Nominee list</h3>
              <p className="muted">Current nominations for this ceremony.</p>
            </div>
            <span className="pill">{nominations.length} nominations</span>
          </header>

          <div className="stack-sm">
            {nominations.length === 0 ? (
              <div className="empty-state">
                <strong>No nominations yet.</strong>
                <div className="muted" style={{ marginTop: 6 }}>
                  Add nominees in the Add nominees tab.
                </div>
              </div>
            ) : (
              <div className="list">
                {nominations.map((n) => {
                  const category =
                    categoryLabelById[n.category_edition_id] ??
                    `Category ${n.category_edition_id}`;

                  const subject = n.song_title
                    ? n.song_title
                    : (n.film_title ?? `Nomination #${n.id}`);
                  const people = n.contributors?.length
                    ? n.contributors.map((c) => c.full_name).join(", ")
                    : (n.performer_name ?? null);

                  return (
                    <div key={n.id} className="list-row">
                      <div style={{ minWidth: 240 }}>
                        <p className="eyebrow">{category}</p>
                        <strong>{subject}</strong>
                        {n.song_title && n.film_title ? (
                          <p className="muted">from {n.film_title}</p>
                        ) : null}
                      </div>
                      <div style={{ flex: 1 }}>
                        {people ? (
                          <p className="muted">{people}</p>
                        ) : (
                          <p className="muted">—</p>
                        )}
                      </div>
                      <div>
                        <div className="inline-actions">
                          <span className="pill">#{n.id}</span>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => void deleteNomination(n.id)}
                            disabled={nominationsLoading}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
