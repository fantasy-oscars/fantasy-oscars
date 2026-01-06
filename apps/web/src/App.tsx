import { FormEvent, useMemo, useState } from "react";

type ApiResult = { ok: boolean; message: string };

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function buildUrl(path: string) {
  return `${API_BASE}${path}`;
}

async function fetchJson<T>(
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(buildUrl(path), init);
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg =
        (json.error as { message?: string } | undefined)?.message ?? "Request failed";
      return { ok: false, error: msg };
    }
    return { ok: true, data: json as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    return { ok: false, error: message };
  }
}

function useApiAction<T extends Record<string, unknown>>(path: string) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [lastPayload, setLastPayload] = useState<T | null>(null);

  async function run(payload: T) {
    setLoading(true);
    setResult(null);
    setLastPayload(payload);
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

  async function retry() {
    if (lastPayload) await run(lastPayload);
  }

  const state: "idle" | "loading" | "success" | "error" = loading
    ? "loading"
    : result
      ? result.ok
        ? "success"
        : "error"
      : "idle";

  return { loading, result, run, retry, state };
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

function FormStatus(props: {
  loading: boolean;
  result: ApiResult | null;
  onRetry?: () => void;
}) {
  const { loading, result, onRetry } = props;
  if (loading) {
    return (
      <div className="status status-loading" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" /> Working...
      </div>
    );
  }
  if (result) {
    return (
      <div
        className={`status ${result.ok ? "status-success" : "status-error"}`}
        role="status"
        aria-live="polite"
      >
        {result.ok ? "Success" : `Error: ${result.message}`}
        {!result.ok && onRetry && (
          <button type="button" className="ghost" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    );
  }
  return null;
}

type Snapshot = {
  draft: { id: number; status: string; current_pick_number: number | null };
  seats: Array<{ seat_number: number; league_member_id: number }>;
  picks: Array<{ pick_number: number; seat_number: number; nomination_id: number }>;
  version: number;
};

function DraftRoom() {
  const [draftId, setDraftId] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  async function loadSnapshot(id: string) {
    setLoading(true);
    setError(null);
    setSnapshot(null);
    const res = await fetchJson<Snapshot>(`/drafts/${id}/snapshot`, { method: "GET" });
    if (res.ok && res.data) {
      setSnapshot(res.data);
    } else {
      setError(res.error ?? "Failed to load snapshot");
    }
    setLoading(false);
  }

  return (
    <section className="card draft-card">
      <header>
        <h2>Draft Room Snapshot</h2>
        <p>Load current draft state to see picks and seating.</p>
      </header>
      <div className="inline-form">
        <label className="field">
          <span>Draft ID</span>
          <input
            value={draftId}
            onChange={(e) => setDraftId(e.target.value)}
            inputMode="numeric"
            pattern="[0-9]*"
          />
        </label>
        <button
          type="button"
          onClick={() => loadSnapshot(draftId)}
          disabled={loading || !draftId}
        >
          {loading ? "Loading..." : "Load snapshot"}
        </button>
        {snapshot && (
          <button
            type="button"
            className="ghost"
            onClick={() => loadSnapshot(draftId)}
            disabled={loading}
          >
            Refresh
          </button>
        )}
      </div>

      {loading && (
        <div className="status status-loading" role="status">
          <span className="spinner" aria-hidden="true" /> Loading draft snapshot...
        </div>
      )}
      {error && (
        <div className="status status-error" role="status">
          Error: {error}{" "}
          <button type="button" className="ghost" onClick={() => loadSnapshot(draftId)}>
            Retry
          </button>
        </div>
      )}

      {snapshot && (
        <div className="draft-grid">
          <div className="summary">
            <p className="eyebrow">Draft #{snapshot.draft?.id ?? "?"}</p>
            <h3>Status: {snapshot.draft?.status ?? "UNKNOWN"}</h3>
            <p className="muted">
              Current pick: {snapshot.draft?.current_pick_number ?? "—"} · Version{" "}
              {snapshot.version}
            </p>
          </div>
          <div>
            <h4>Seats</h4>
            <ul className="pill-list">
              {snapshot.seats.map((seat) => (
                <li key={seat.seat_number} className="pill">
                  Seat {seat.seat_number} · Member {seat.league_member_id}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Picks</h4>
            {snapshot.picks.length === 0 ? (
              <p className="muted">No picks yet.</p>
            ) : (
              <ol className="pick-list">
                {snapshot.picks.map((pick) => (
                  <li key={pick.pick_number}>
                    #{pick.pick_number} · Seat {pick.seat_number} · Nomination{" "}
                    {pick.nomination_id}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </section>
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
      <FormStatus loading={api.loading} result={api.result} onRetry={api.retry} />
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
      <FormStatus loading={api.loading} result={api.result} onRetry={api.retry} />
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
      <FormStatus loading={api.loading} result={api.result} onRetry={api.retry} />
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
      <FormStatus loading={api.loading} result={api.result} onRetry={api.retry} />
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
      <div className="status-tray" aria-live="polite">
        <div className="status-pill">
          Loading and error states are now surfaced on every action. If something fails,
          use the Retry button to re-submit.
        </div>
      </div>
      <div className="grid">
        <RegisterForm />
        <LoginForm />
      </div>
      <div className="grid">
        <ResetRequestForm />
        <ResetConfirmForm />
        <DraftRoom />
      </div>
    </main>
  );
}
