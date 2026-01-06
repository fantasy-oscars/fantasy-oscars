import { FormEvent, useMemo, useState } from "react";

type ApiResult = { ok: boolean; message: string };

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function buildUrl(path: string) {
  return `${API_BASE}${path}`;
}

function useApiAction<T extends Record<string, unknown>>(path: string) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);

  async function run(payload: T) {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(buildUrl(path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!res.ok) {
        setResult({ ok: false, message: json.error?.message ?? "Request failed" });
      } else {
        setResult({ ok: true, message: "Success" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      setResult({ ok: false, message });
    } finally {
      setLoading(false);
    }
  }

  return { loading, result, run };
}

type FieldErrors = Partial<Record<string, string>>;

function useRequiredFields(fields: string[]) {
  return useMemo(
    () =>
      function validate(formData: FormData) {
        const errors: FieldErrors = {};
        for (const field of fields) {
          const value = String(formData.get(field) ?? "").trim();
          if (!value) errors[field] = "Required";
        }
        return errors;
      },
    [fields]
  );
}

function FormField(props: {
  label: string;
  name: string;
  type?: string;
  error?: string;
  defaultValue?: string;
}) {
  const { label, name, type = "text", error, defaultValue } = props;
  return (
    <label className="field">
      <span>{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} aria-invalid={!!error} />
      {error && <small className="error">{error}</small>}
    </label>
  );
}

function RegisterForm() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const validator = useRequiredFields(["handle", "email", "display_name", "password"]);
  const api = useApiAction<{
    handle: string;
    email: string;
    display_name: string;
    password: string;
  }>("/auth/register");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const fieldErrors = validator(data);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;
    await api.run({
      handle: String(data.get("handle")),
      email: String(data.get("email")),
      display_name: String(data.get("display_name")),
      password: String(data.get("password"))
    });
  }

  return (
    <section className="card">
      <header>
        <h2>Create Account</h2>
        <p>Register a new user.</p>
      </header>
      <form onSubmit={onSubmit}>
        <FormField label="Handle" name="handle" error={errors.handle} />
        <FormField label="Email" name="email" type="email" error={errors.email} />
        <FormField label="Display name" name="display_name" error={errors.display_name} />
        <FormField
          label="Password"
          name="password"
          type="password"
          error={errors.password}
        />
        <button type="submit" disabled={api.loading}>
          {api.loading ? "Submitting..." : "Register"}
        </button>
      </form>
      {api.result && (
        <p className={api.result.ok ? "success" : "error"} role="status">
          {api.result.message}
        </p>
      )}
    </section>
  );
}

function LoginForm() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const validator = useRequiredFields(["handle", "password"]);
  const api = useApiAction<{ handle: string; password: string }>("/auth/login");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const fieldErrors = validator(data);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;
    await api.run({
      handle: String(data.get("handle")),
      password: String(data.get("password"))
    });
  }

  return (
    <section className="card">
      <header>
        <h2>Login</h2>
        <p>Sign in with your handle and password.</p>
      </header>
      <form onSubmit={onSubmit}>
        <FormField label="Handle" name="handle" error={errors.handle} />
        <FormField
          label="Password"
          name="password"
          type="password"
          error={errors.password}
        />
        <button type="submit" disabled={api.loading}>
          {api.loading ? "Signing in..." : "Login"}
        </button>
      </form>
      {api.result && (
        <p className={api.result.ok ? "success" : "error"} role="status">
          {api.result.message}
        </p>
      )}
    </section>
  );
}

function ResetRequestForm() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const validator = useRequiredFields(["email"]);
  const api = useApiAction<{ email: string }>("/auth/reset-request");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const fieldErrors = validator(data);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;
    await api.run({ email: String(data.get("email")) });
  }

  return (
    <section className="card">
      <header>
        <h2>Reset Password</h2>
        <p>Request a password reset link.</p>
      </header>
      <form onSubmit={onSubmit}>
        <FormField label="Email" name="email" type="email" error={errors.email} />
        <button type="submit" disabled={api.loading}>
          {api.loading ? "Sending..." : "Send reset link"}
        </button>
      </form>
      {api.result && (
        <p className={api.result.ok ? "success" : "error"} role="status">
          {api.result.message}
        </p>
      )}
    </section>
  );
}

function ResetConfirmForm() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const validator = useRequiredFields(["token", "password"]);
  const api = useApiAction<{ token: string; password: string }>("/auth/reset-confirm");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const fieldErrors = validator(data);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;
    await api.run({
      token: String(data.get("token")),
      password: String(data.get("password"))
    });
  }

  return (
    <section className="card">
      <header>
        <h2>Set New Password</h2>
        <p>Paste the reset token and choose a new password.</p>
      </header>
      <form onSubmit={onSubmit}>
        <FormField label="Reset token" name="token" error={errors.token} />
        <FormField
          label="New password"
          name="password"
          type="password"
          error={errors.password}
        />
        <button type="submit" disabled={api.loading}>
          {api.loading ? "Updating..." : "Update password"}
        </button>
      </form>
      {api.result && (
        <p className={api.result.ok ? "success" : "error"} role="status">
          {api.result.message}
        </p>
      )}
    </section>
  );
}

export function App() {
  return (
    <main className="container">
      <header className="hero">
        <div>
          <p className="eyebrow">Fantasy Oscars</p>
          <h1>Sign up, sign in, and recover access</h1>
          <p className="lede">
            Minimal auth flows wired to the backend endpoints. Use your handle and email
            to get started.
          </p>
        </div>
      </header>
      <div className="grid">
        <RegisterForm />
        <LoginForm />
      </div>
      <div className="grid">
        <ResetRequestForm />
        <ResetConfirmForm />
      </div>
    </main>
  );
}
