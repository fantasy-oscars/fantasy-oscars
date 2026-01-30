import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="card">
      <header>
        <h2>Not found</h2>
        <p className="muted">That page does not exist.</p>
      </header>
      <Link to="/" className="button ghost">
        Go to home
      </Link>
    </section>
  );
}
