import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthContext } from "../auth/context";
import { useRequiredFields, FormField, FormStatus } from "../ui/forms";
import type { ApiResult, FieldErrors } from "../lib/types";
import { authFieldErrorMessage } from "../features/auth/validation";

export function LoginPage() {
  const { login } = useAuthContext();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const validator = useRequiredFields(["username", "password"]);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const errs = validator(data);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    const res = await login({
      username: String(data.get("username")),
      password: String(data.get("password"))
    });
    setLoading(false);
    if (!res.ok) {
      const nextErrors: FieldErrors = { ...errs };
      res.errorFields?.forEach((field) => {
        nextErrors[field] = authFieldErrorMessage(field);
      });
      setErrors(nextErrors);
      setResult({
        ok: false,
        message:
          res.errorCode === "VALIDATION_ERROR" && res.errorFields?.length
            ? "Please check the highlighted fields and try again."
            : (res.error ?? "Login failed")
      });
      return;
    }
    setResult({ ok: true, message: "Logged in" });
    navigate(from, { replace: true });
  }

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
