import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLeagueSeasonCreate } from "../features/seasons/useLeagueSeasonCreate";
import { FormStatus } from "../ui/forms";
import { PageError, PageLoader } from "../ui/page-state";

export function LeagueSeasonCreatePage() {
  const { id } = useParams();
  const leagueId = Number(id);
  const navigate = useNavigate();
  const view = useLeagueSeasonCreate({ leagueId });
  const [ceremonyId, setCeremonyId] = useState<number | null>(null);
  const [scoringStrategy, setScoringStrategy] = useState<"fixed" | "negative">("fixed");
  const [remainderStrategy, setRemainderStrategy] = useState<"UNDRAFTED" | "FULL_POOL">(
    "UNDRAFTED"
  );

  const canSubmit = useMemo(() => {
    return (
      view.state === "ready" &&
      !view.working &&
      Number.isFinite(ceremonyId) &&
      (ceremonyId ?? 0) > 0
    );
  }, [ceremonyId, view.state, view.working]);

  async function onSubmit() {
    if (!ceremonyId) return;
    const res = await view.createSeason({
      ceremonyId,
      scoringStrategy,
      remainderStrategy
    });
    if (res.ok && res.seasonId) {
      navigate(`/seasons/${res.seasonId}`, { replace: true });
    }
  }

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
        <PageError message="You are not a member of this league." />
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
        <PageError message={view.error ?? "Unexpected error"} />
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
            value={ceremonyId ?? ""}
            onChange={(e) =>
              setCeremonyId(e.target.value ? Number(e.target.value) : null)
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
            value={scoringStrategy}
            onChange={(e) => setScoringStrategy(e.target.value as "fixed" | "negative")}
            disabled={view.working}
          >
            <option value="fixed">Fixed</option>
            <option value="negative">Negative</option>
          </select>
        </label>

        <label className="field">
          <span>Leftover picks</span>
          <select
            value={remainderStrategy}
            onChange={(e) =>
              setRemainderStrategy(e.target.value as "UNDRAFTED" | "FULL_POOL")
            }
            disabled={view.working}
          >
            <option value="UNDRAFTED">Leave extras undrafted</option>
            <option value="FULL_POOL">Use full pool (extras drafted)</option>
          </select>
        </label>

        <div className="inline-actions">
          <button type="button" onClick={() => void onSubmit()} disabled={!canSubmit}>
            {view.working ? "Creating..." : "Create season"}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setCeremonyId(null);
              setScoringStrategy("fixed");
              setRemainderStrategy("UNDRAFTED");
              view.setStatus(null);
            }}
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
