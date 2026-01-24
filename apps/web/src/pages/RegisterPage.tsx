import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthContext } from "../auth/context";
import { useRequiredFields, FormField, FormStatus } from "../ui/forms";
import type { ApiResult, FieldErrors } from "../lib/types";

export function RegisterPage() {
  const { register, error } = useAuthContext();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const validator = useRequiredFields(["username", "email", "password"]);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const errs = validator(data);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    const res = await register({
      username: String(data.get("username")),
      email: String(data.get("email")),
      password: String(data.get("password"))
    });
    setLoading(false);
    if (!res.ok) {
      const nextErrors: FieldErrors = { ...errs };
      res.errorFields?.forEach((field) => {
        nextErrors[field] = "Invalid";
      });
      setErrors(nextErrors);
      setResult({ ok: false, message: res.error ?? "Registration failed" });
      return;
    }
    setResult({ ok: true, message: "Account created" });
    navigate("/", { replace: true });
  }

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
        {error && <small className="muted">Last error: {error}</small>}
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

