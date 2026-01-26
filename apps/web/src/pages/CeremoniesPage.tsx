import { ResultsPage } from "./ResultsPage";

export function CeremoniesPage() {
  return (
    <section className="card">
      <header>
        <h2>Ceremonies</h2>
        <p className="muted">
          Active ceremony winners and draft standings. (MVP: uses a selected draft to
          compute standings.)
        </p>
      </header>
      <ResultsPage />
    </section>
  );
}
