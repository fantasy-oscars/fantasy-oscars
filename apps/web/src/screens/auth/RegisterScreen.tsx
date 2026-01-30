import { Link } from "react-router-dom";
import type { ApiResult, FieldErrors } from "../../lib/types";
import { FormField, FormStatus } from "../../ui/forms";

export function RegisterScreen(props: {
  errors: FieldErrors;
  result: ApiResult | null;
  loading: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  const { errors, result, loading, onSubmit } = props;
  return (
    <div className="card-grid">
      <section className="card">
        <header>
          <h2>Create Account</h2>
          <p>Pick a username and join a league.</p>
        </header>
        <form onSubmit={onSubmit}>
          <FormField label="Username" name="username" error={errors.username} />
          <FormField label="Email" name="email" error={errors.email} />
          <FormField
            label="Password"
            name="password"
            type="password"
            error={errors.password}
          />
          <button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Register"}
          </button>
        </form>
        <FormStatus loading={loading} result={result} />
      </section>
      <section className="card">
        <header>
          <h3>Already have an account?</h3>
          <p>Sign in to view leagues and drafts.</p>
        </header>
        <Link to="/login" className="button ghost">
          Go to login
        </Link>
      </section>
    </div>
  );
}
