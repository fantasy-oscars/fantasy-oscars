import { useNavigate } from "react-router-dom";
import { FormField } from "../ui/forms";
import { useCreateLeague } from "../features/leagues/useCreateLeague";

export function LeagueCreatePage() {
  const { creating, error, create } = useCreateLeague();
  const navigate = useNavigate();

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const payload = {
      name: String(data.get("name") ?? "").trim()
    };
    const res = await create(payload);
    if (res.ok && res.league?.id) {
      navigate(`/leagues/${res.league.id}`);
    }
  }

  return (
    <section className="card">
      <header>
        <h2>Create league</h2>
        <p className="muted">
          Creating a league creates the initial season for the active ceremony.
        </p>
      </header>

      <form className="grid" onSubmit={onCreate}>
        <FormField label="Name" name="name" />
        <div className="inline-actions">
          <button type="submit" className="button" disabled={creating}>
            {creating ? "Creating..." : "Create league"}
          </button>
          {error && <small className="error">{error}</small>}
        </div>
      </form>
    </section>
  );
}
