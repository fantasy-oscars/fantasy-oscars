import { Link } from "react-router-dom";
import type { LeagueSeasonCreateView } from "../../orchestration/seasons";
import { FormStatus } from "../../ui/forms";
import { PageError, PageLoader } from "../../ui/page-state";

export function LeagueSeasonCreateScreen(props: {
  leagueId: number;
  view: LeagueSeasonCreateView;
  actions: {
    setCeremonyId: (v: number | null) => void;
    setScoringStrategy: (v: "fixed" | "negative") => void;
    setRemainderStrategy: (v: "UNDRAFTED" | "FULL_POOL") => void;
    reset: () => void;
    submit: () => void;
  };
}) {
  const { leagueId, view, actions } = props;

  if (view.state === "loading") {
    return <PageLoader label="Loading..." />;
  }

  if (view.state === "forbidden") {
    return (
      <section className="card">
        <header>
          <h2>Create season</h2>
          <p className="muted">Access denied.</p>
        </header>
        <PageError message={view.message} />
      </section>
    );
  }

  if (view.state === "error") {
    return (
      <section className="card">
        <header>
          <h2>Create season</h2>
          <p className="muted">Unable to load</p>
        </header>
        <PageError message={view.message} />
      </section>
    );
  }

  const leagueName = view.league?.name ?? `League #${leagueId}`;

  return (
    <section className="card">
      <header className="header-with-controls">
        <div>
          <h2>Create season</h2>
          <p className="muted">Create a new season for {leagueName}.</p>
        </div>
        <div className="inline-actions">
          <Link to={`/leagues/${leagueId}`} className="button ghost">
            Back to league
          </Link>
        </div>
      </header>

      <div className="stack-sm">
        <label className="field">
          <span>Ceremony</span>
          <select
            value={view.ceremonyId ?? ""}
            onChange={(e) =>
              actions.setCeremonyId(e.target.value ? Number(e.target.value) : null)
            }
            disabled={view.working}
          >
            <option value="">Select ceremony…</option>
            {view.ceremonies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
          {view.ceremonies.length === 0 && (
            <p className="muted">No published ceremonies available yet.</p>
          )}
        </label>

        <label className="field">
          <span>Scoring strategy</span>
          <select
            value={view.scoringStrategy}
            onChange={(e) =>
              actions.setScoringStrategy(e.target.value as "fixed" | "negative")
            }
            disabled={view.working}
          >
            <option value="fixed">Fixed</option>
            <option value="negative">Negative</option>
          </select>
        </label>

        <label className="field">
          <span>Leftover picks</span>
          <select
            value={view.remainderStrategy}
            onChange={(e) =>
              actions.setRemainderStrategy(e.target.value as "UNDRAFTED" | "FULL_POOL")
            }
            disabled={view.working}
          >
            <option value="UNDRAFTED">Leave extras undrafted</option>
            <option value="FULL_POOL">Use full pool (extras drafted)</option>
          </select>
        </label>

        <div className="inline-actions">
          <button type="button" onClick={actions.submit} disabled={!view.canSubmit}>
            {view.working ? "Creating..." : "Create season"}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={actions.reset}
            disabled={view.working}
          >
            Reset
          </button>
        </div>

        <FormStatus loading={view.working} result={view.status} />
      </div>
    </section>
  );
}
