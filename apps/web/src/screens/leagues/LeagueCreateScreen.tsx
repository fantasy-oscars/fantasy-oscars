import { FormField } from "../../ui/forms";

export function LeagueCreateScreen(props: {
  creating: boolean;
  error: string | null;
  onCreate: (e: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  const { creating, error, onCreate } = props;

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
