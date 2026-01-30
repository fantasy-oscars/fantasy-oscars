import { Link } from "react-router-dom";
import type { ApiResult, FieldErrors } from "../../lib/types";
import { FormField, FormStatus } from "../../ui/forms";

export function LoginScreen(props: {
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
          <h2>Login</h2>
          <p>Sign in with your username and password.</p>
        </header>
        <form onSubmit={onSubmit}>
          <FormField label="Username" name="username" error={errors.username} />
          <FormField
            label="Password"
            name="password"
            type="password"
            error={errors.password}
          />
          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
        <FormStatus loading={loading} result={result} />
      </section>
      <section className="card">
        <header>
          <h3>New here?</h3>
          <p>Create an account to join or run drafts.</p>
        </header>
        <Link to="/register" className="button ghost">
          Go to registration
        </Link>
      </section>
    </div>
  );
}
