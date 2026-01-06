import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { NomineePill } from "./components/NomineePill";

type ApiResult = { ok: boolean; message: string };

type Env = { VITE_API_BASE?: string };
const API_BASE = (
  (import.meta as unknown as { env: Env }).env.VITE_API_BASE ?? ""
).trim();

function buildUrl(path: string) {
  return `${API_BASE}${path}`;
}

async function fetchJson<T>(
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(buildUrl(path), {
      credentials: "include",
      ...init
    });
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
        credentials: "include",
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

  return { loading, result, run, retry };
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

type AuthUser = { sub: string; handle?: string; email?: string; display_name?: string };

function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchJson<{ user: AuthUser }>("/auth/me", { method: "GET" });
    if (res.ok) {
      setUser(res.data?.user ?? null);
    } else {
      setError(res.error ?? "Unable to verify session");
      setUser(null);
    }
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    await fetchJson("/auth/logout", { method: "POST" });
    setUser(null);
    setLoading(false);
  }, []);

  return { user, setUser, loading, error, refresh, logout };
}

function DraftRoom(props: { initialDraftId?: string | number; disabled?: boolean }) {
  const { initialDraftId, disabled } = props;
  const [draftId, setDraftId] = useState(String(initialDraftId ?? "1"));
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
          disabled={loading || !draftId || disabled}
        >
          {loading ? "Loading..." : "Load snapshot"}
        </button>
        {snapshot && (
          <button
            type="button"
            className="ghost"
            onClick={() => loadSnapshot(draftId)}
            disabled={loading || disabled}
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

function LoginForm(props: { onLogin?: (user: AuthUser) => void }) {
  const { onLogin } = props;
  const [errors, setErrors] = useState<FieldErrors>({});
  const validator = useRequiredFields(["handle", "password"]);
  const [state, setState] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const fieldErrors = validator(data);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;
    setLoading(true);
    const res = await fetchJson<{ user: AuthUser }>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: String(data.get("handle")),
        password: String(data.get("password"))
      })
    });
    if (res.ok) {
      setState({ ok: true, message: "Logged in" });
      if (res.data?.user && onLogin) onLogin(res.data.user);
    } else {
      setState({ ok: false, message: res.error ?? "Login failed" });
    }
    setLoading(false);
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
        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Login"}
        </button>
      </form>
      <FormStatus loading={loading} result={state} />
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

function EventSetup(props: {
  user: AuthUser;
  onNavigateToDraft: (draftId: number) => void;
}) {
  const { user, onNavigateToDraft } = props;
  const [createLeagueResult, setCreateLeagueResult] = useState<ApiResult | null>(null);
  const [createdLeagueId, setCreatedLeagueId] = useState<number | null>(null);
  const [joinedMemberId, setJoinedMemberId] = useState<number | null>(null);
  const [createDraftResult, setCreateDraftResult] = useState<ApiResult | null>(null);
  const [draftId, setDraftId] = useState<number | null>(null);
  const requiredLeagueFields = useRequiredFields([
    "code",
    "name",
    "ceremony_id",
    "max_members",
    "roster_size"
  ]);
  const requiredJoinFields = useRequiredFields(["league_id"]);
  const requiredDraftFields = useRequiredFields(["league_id"]);

  async function handleCreateLeague(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const errors = requiredLeagueFields(data);
    if (Object.keys(errors).length) {
      setCreateLeagueResult({ ok: false, message: "Please fill all required fields" });
      return;
    }
    setCreateLeagueResult(null);
    const payload = {
      code: String(data.get("code")),
      name: String(data.get("name")),
      ceremony_id: Number(data.get("ceremony_id")),
      max_members: Number(data.get("max_members")),
      roster_size: Number(data.get("roster_size")),
      is_public: Boolean(data.get("is_public"))
    };
    const res = await fetchJson<{ league: { id: number } }>("/leagues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (res.ok && res.data?.league?.id) {
      setCreatedLeagueId(res.data.league.id);
      setCreateLeagueResult({
        ok: true,
        message: `League #${res.data.league.id} created`
      });
    } else {
      setCreateLeagueResult({ ok: false, message: res.error ?? "Create league failed" });
    }
  }

  async function handleJoinLeague(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const errors = requiredJoinFields(data);
    if (Object.keys(errors).length) {
      setJoinedMemberId(null);
      setCreateLeagueResult({ ok: false, message: "League id is required" });
      return;
    }
    const leagueId = Number(data.get("league_id"));
    const res = await fetchJson<{ member: { id: number } }>(`/leagues/${leagueId}/join`, {
      method: "POST"
    });
    if (res.ok && res.data?.member?.id) {
      setJoinedMemberId(res.data.member.id);
      setCreateLeagueResult({ ok: true, message: `Joined league #${leagueId}` });
    } else {
      setJoinedMemberId(null);
      setCreateLeagueResult({ ok: false, message: res.error ?? "Join failed" });
    }
  }

  async function handleCreateDraft(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const errors = requiredDraftFields(data);
    if (Object.keys(errors).length) {
      setCreateDraftResult({ ok: false, message: "League id is required" });
      return;
    }
    setCreateDraftResult(null);
    const leagueId = Number(data.get("league_id"));
    const order = String(data.get("draft_order_type") ?? "SNAKE").toUpperCase();
    const res = await fetchJson<{ draft: { id: number } }>("/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league_id: leagueId, draft_order_type: order })
    });
    if (res.ok && res.data?.draft?.id) {
      setDraftId(res.data.draft.id);
      setCreateDraftResult({ ok: true, message: `Draft #${res.data.draft.id} created` });
      onNavigateToDraft(res.data.draft.id);
    } else {
      setCreateDraftResult({ ok: false, message: res.error ?? "Create draft failed" });
    }
  }

  return (
    <div className="grid">
      <section className="card">
        <header>
          <h2>Create an Event (League)</h2>
          <p>
            Authenticated as {user.handle ?? user.sub}. Create a league/event container.
          </p>
        </header>
        <form onSubmit={handleCreateLeague}>
          <div className="grid two-col">
            <FormField label="Code" name="code" defaultValue="my-draft" />
            <FormField label="Name" name="name" defaultValue="My Awards Draft" />
            <FormField label="Ceremony ID" name="ceremony_id" defaultValue="1" />
            <FormField label="Max members" name="max_members" defaultValue="6" />
            <FormField label="Roster size" name="roster_size" defaultValue="6" />
          </div>
          <label className="checkbox">
            <input type="checkbox" name="is_public" /> <span>Public league</span>
          </label>
          <button type="submit">Create league</button>
        </form>
        <FormStatus loading={false} result={createLeagueResult} />
        {createdLeagueId && (
          <p className="muted">
            Latest league id: {createdLeagueId}. Use it to join or draft.
          </p>
        )}
      </section>

      <section className="card">
        <header>
          <h2>Join a League</h2>
          <p>Enter a league id to join before the draft starts.</p>
        </header>
        <form onSubmit={handleJoinLeague}>
          <FormField label="League ID" name="league_id" type="number" />
          <button type="submit">Join league</button>
        </form>
        <FormStatus
          loading={false}
          result={
            joinedMemberId
              ? { ok: true, message: `Joined as member #${joinedMemberId}` }
              : createLeagueResult
          }
        />
      </section>

      <section className="card">
        <header>
          <h2>Create Draft</h2>
          <p>Create the draft for your league and jump to the draft room.</p>
        </header>
        <form onSubmit={handleCreateDraft}>
          <FormField
            label="League ID"
            name="league_id"
            type="number"
            defaultValue={createdLeagueId ? String(createdLeagueId) : undefined}
          />
          <label className="field">
            <span>Draft order type</span>
            <select name="draft_order_type" defaultValue="SNAKE">
              <option value="SNAKE">SNAKE</option>
              <option value="LINEAR">LINEAR</option>
            </select>
          </label>
          <button type="submit">Create draft</button>
          {draftId && (
            <button
              type="button"
              className="ghost"
              onClick={() => onNavigateToDraft(draftId)}
              style={{ marginLeft: "0.5rem" }}
            >
              Go to draft room
            </button>
          )}
        </form>
        <FormStatus loading={false} result={createDraftResult} />
      </section>
    </div>
  );
}

export function App() {
  const {
    user,
    setUser,
    loading: authLoading,
    error: authError,
    refresh,
    logout
  } = useAuth();
  const [view, setView] = useState<"setup" | "draft">("setup");
  const [draftRoomId, setDraftRoomId] = useState<number | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function handleNavigateToDraft(id: number) {
    setDraftRoomId(id);
    setView("draft");
  }

  return (
    <main className="container">
      <header className="hero">
        <div>
          <p className="eyebrow">Fantasy Oscars</p>
          <h1>Event setup and draft room</h1>
          <p className="lede">Create or join your league, then enter the draft room.</p>
        </div>
        <div className="status-pill">
          {authLoading
            ? "Checking session..."
            : user
              ? `Signed in as ${user.handle ?? user.sub}`
              : "Not signed in"}
          <div className="pill-actions">
            <button
              type="button"
              className="ghost"
              onClick={refresh}
              disabled={authLoading}
            >
              Refresh session
            </button>
            {user && (
              <button
                type="button"
                className="ghost"
                onClick={logout}
                disabled={authLoading}
              >
                Logout
              </button>
            )}
          </div>
        </div>
      </header>
      {authError && <div className="status status-error">Auth error: {authError}</div>}

      <div className="tab-bar">
        <button
          type="button"
          className={view === "setup" ? "tab active" : "tab"}
          onClick={() => setView("setup")}
        >
          Event setup
        </button>
        <button
          type="button"
          className={view === "draft" ? "tab active" : "tab"}
          onClick={() => setView("draft")}
          disabled={!user}
        >
          Draft room
        </button>
      </div>

      {view === "setup" && (
        <>
          {!user && (
            <div className="status status-error" role="alert">
              Sign in to create or join events.
            </div>
          )}
          <div className="grid">
            <RegisterForm />
            <LoginForm
              onLogin={(u) => {
                setUser(u);
                setView("setup");
              }}
            />
          </div>
          <div className="grid">
            <ResetRequestForm />
            <ResetConfirmForm />
          </div>
          {user && <EventSetup user={user} onNavigateToDraft={handleNavigateToDraft} />}
        </>
      )}

      {view === "draft" && (
        <DraftRoom initialDraftId={draftRoomId ?? undefined} disabled={!user} />
      )}

      <section className="card">
        <header>
          <h2>Nominee pill density preview</h2>
          <p>Baseline styles with truncation and distinct states.</p>
        </header>
        <div className="pill-demo">
          <NomineePill
            name="An Incredibly Long Nominee Name That Should Truncate Gracefully On One Line"
            category="Best Picture"
          />
          <NomineePill name="First pick" category="Best Actor" state="active" />
          <NomineePill name="Already picked" category="Best Actress" state="picked" />
          <NomineePill name="Locked out" category="Editing" state="disabled" />
        </div>
      </section>
    </main>
  );
}
