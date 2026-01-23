import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  NavLink,
  Link,
  useLocation,
  useNavigate,
  useParams
} from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import { NomineePill } from "./components/NomineePill";

type ApiResult = { ok: boolean; message: string };
type ApiError = { code?: string; message?: string };

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
): Promise<{
  ok: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  errorFields?: string[];
}> {
  try {
    const res = await fetch(buildUrl(path), {
      credentials: "include",
      ...init
    });
    const json = (await res.json().catch(() => ({}))) as { error?: ApiError } & Record<
      string,
      unknown
    >;
    if (!res.ok) {
      const err = json.error ?? {};
      const msg = err.message ?? "Request failed";
      const code = err.code;
      const fields =
        Array.isArray((err as { details?: { fields?: unknown } })?.details?.fields) &&
        (err as { details: { fields: unknown[] } }).details.fields.every(
          (f) => typeof f === "string"
        )
          ? ((err as { details: { fields: string[] } }).details.fields as string[])
          : undefined;
      return { ok: false, error: msg, errorCode: code, errorFields: fields };
    }
    return { ok: true, data: json as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    return { ok: false, error: message };
  }
}

function allocationLabel(strategy?: string | null) {
  switch (strategy) {
    case "FULL_POOL":
      return "Use full pool (extras drafted)";
    case "UNDRAFTED":
    default:
      return "Leave extras undrafted";
  }
}

type FieldErrors = Partial<Record<string, string>>;
type LeagueSummary = { id: number; code: string; name: string; ceremony_id: number };
type LeagueDetail = LeagueSummary & { max_members?: number; roster_size?: number };
type LeagueMember = {
  id: number;
  user_id: number;
  role: string;
  handle: string;
  display_name: string;
};
type SeasonSummary = {
  id: number;
  league_id: number;
  ceremony_id: number;
  status: string;
  created_at: string;
  ceremony_starts_at?: string | null;
  draft_id?: number | null;
  draft_status?: string | null;
  scoring_strategy_name?: string;
  is_active_ceremony?: boolean;
  remainder_strategy?: string;
};
type SeasonMember = {
  id: number;
  season_id: number;
  user_id: number;
  league_member_id: number | null;
  role: string;
  joined_at: string;
};
type SeasonInvite = {
  id: number;
  season_id: number;
  status: string;
  label: string | null;
  kind: string;
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
};
type InboxInvite = SeasonInvite & {
  league_id: number | null;
  league_name: string | null;
  ceremony_id: number | null;
};
type SeasonMeta = {
  id: number;
  ceremony_id: number;
  status: string;
  scoring_strategy_name?: string;
  is_active_ceremony?: boolean;
  created_at?: string;
  ceremony_starts_at?: string | null;
  draft_id?: number | null;
  draft_status?: string | null;
  remainder_strategy?: string;
  pick_timer_seconds?: number | null;
  auto_pick_strategy?: string | null;
};
type TokenMap = Record<number, string>;

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
    const message =
      result.ok && result.message
        ? result.message
        : result.ok
          ? "Success"
          : result.message;
    return (
      <div
        className={`status ${result.ok ? "status-success" : "status-error"}`}
        role="status"
        aria-live="polite"
      >
        {result.ok ? message : `Error: ${result.message}`}
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

type AuthUser = {
  sub: string;
  handle?: string;
  email?: string;
  display_name?: string;
  is_admin?: boolean;
};
type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  login: (input: { handle: string; password: string }) => Promise<{
    ok: boolean;
    error?: string;
    errorFields?: string[];
  }>;
  register: (input: {
    handle: string;
    email: string;
    display_name: string;
    password: string;
  }) => Promise<{
    ok: boolean;
    error?: string;
    errorFields?: string[];
  }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthContext missing");
  return ctx;
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchJson<{ user: AuthUser }>("/auth/me", { method: "GET" });
    if (res.ok) {
      setUser(res.data?.user ?? null);
    } else {
      setUser(null);
      setError(res.error ?? "Unable to verify session");
    }
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    await fetchJson("/auth/logout", { method: "POST" });
    setUser(null);
    setLoading(false);
  }, []);

  const login = useCallback(async (input: { handle: string; password: string }) => {
    setError(null);
    const res = await fetchJson<{ user: AuthUser }>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    if (res.ok && res.data?.user) {
      setUser(res.data.user);
      return { ok: true as const };
    }
    setError(res.error ?? "Login failed");
    setUser(null);
    return { ok: false as const, error: res.error, errorFields: res.errorFields };
  }, []);

  const register = useCallback(
    async (input: {
      handle: string;
      email: string;
      display_name: string;
      password: string;
    }) => {
      setError(null);
      const res = await fetchJson("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
      if (res.ok) {
        // Auto-login fetch
        await login({ handle: input.handle, password: input.password });
        return { ok: true as const };
      }
      setError(res.error ?? "Registration failed");
      return { ok: false as const, error: res.error, errorFields: res.errorFields };
    },
    [login]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ user, loading, error, refresh, logout, login, register }),
    [user, loading, error, refresh, logout, login, register]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthContext();
  const location = useLocation();
  if (loading) return <PageLoader label="Checking session..." />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthContext();
  if (loading) return <PageLoader label="Checking session..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_admin) {
    return (
      <section className="card">
        <header>
          <h2>Admin</h2>
          <p className="muted">Admins only</p>
        </header>
        <div className="status status-error" role="status">
          You do not have access to the admin console.
        </div>
      </section>
    );
  }
  return <>{children}</>;
}

function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthContext();
  if (loading) return <PageLoader label="Checking session..." />;
  if (user) return <Navigate to="/leagues" replace />;
  return <>{children}</>;
}

function PageLoader(props: { label?: string }) {
  return (
    <div className="page-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" /> {props.label ?? "Loading..."}
    </div>
  );
}

function PageError(props: { message: string }) {
  return (
    <div className="page-state status status-error" role="alert">
      {props.message}
    </div>
  );
}

function ShellLayout() {
  const { user, loading, error, logout, refresh } = useAuthContext();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Fantasy Oscars</p>
          <h1 className="app-title">MVP Console</h1>
        </div>
        <div className="status-pill">
          {loading
            ? "Checking session..."
            : user
              ? `Signed in as ${user.handle ?? user.sub}`
              : "Not signed in"}
          <div className="pill-actions">
            <button type="button" className="ghost" onClick={refresh} disabled={loading}>
              Refresh
            </button>
            {user && (
              <button type="button" className="ghost" onClick={logout} disabled={loading}>
                Logout
              </button>
            )}
          </div>
        </div>
      </header>
      {error && <PageError message={`Auth error: ${error}`} />}
      <nav className="nav-bar">
        <NavLink
          className={({ isActive }) =>
            isActive ||
            location.pathname === "/" ||
            location.pathname === "" ||
            location.pathname.startsWith("/leagues")
              ? "nav-link active"
              : "nav-link"
          }
          to="/leagues"
        >
          Leagues
        </NavLink>
        <NavLink
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
          to="/invites"
        >
          Invites
        </NavLink>
        <NavLink
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
          to="/drafts/1"
        >
          Draft Room
        </NavLink>
        <NavLink
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
          to="/results"
        >
          Results
        </NavLink>
        <NavLink
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
          to="/account"
        >
          Account
        </NavLink>
        <NavLink
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
          to="/admin"
        >
          Admin
        </NavLink>
      </nav>
      <section className="app-body">
        <Outlet />
      </section>
    </div>
  );
}

function LoginPage() {
  const { login, error } = useAuthContext();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const validator = useRequiredFields(["handle", "password"]);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/leagues";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const errs = validator(data);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    const res = await login({
      handle: String(data.get("handle")),
      password: String(data.get("password"))
    });
    setLoading(false);
    if (!res.ok) {
      const nextErrors: FieldErrors = { ...errs };
      res.errorFields?.forEach((field) => {
        nextErrors[field] = "Invalid";
      });
      setErrors(nextErrors);
      setResult({ ok: false, message: res.error ?? "Login failed" });
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
        <FormStatus loading={loading} result={result} />
        {error && <small className="muted">Last error: {error}</small>}
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

function RegisterPage() {
  const { register } = useAuthContext();
  const validator = useRequiredFields(["handle", "email", "display_name", "password"]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const fieldErrors = validator(data);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;
    setLoading(true);
    const res = await register({
      handle: String(data.get("handle")),
      email: String(data.get("email")),
      display_name: String(data.get("display_name")),
      password: String(data.get("password"))
    });
    setLoading(false);
    if (!res.ok) {
      const nextErrors: FieldErrors = { ...fieldErrors };
      if (res.errorFields?.length) {
        res.errorFields.forEach((field) => {
          nextErrors[field] = "Invalid";
        });
      } else {
        nextErrors.handle = nextErrors.handle ?? "Invalid";
        nextErrors.email = nextErrors.email ?? "Invalid";
        nextErrors.display_name = nextErrors.display_name ?? "Invalid";
        nextErrors.password = nextErrors.password ?? "Invalid";
      }
      setErrors(nextErrors);
      setResult({ ok: false, message: res.error ?? "Registration failed" });
      return;
    }
    setResult({ ok: true, message: "Registered" });
    navigate("/leagues", { replace: true });
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
        <button type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Register"}
        </button>
      </form>
      <FormStatus loading={loading} result={result} />
    </section>
  );
}

function ResetRequestPage() {
  const validator = useRequiredFields(["email"]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const fieldErrors = validator(data);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;
    setLoading(true);
    const res = await fetchJson("/auth/reset-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: String(data.get("email")) })
    });
    setLoading(false);
    setResult({
      ok: res.ok,
      message: res.ok ? "Reset link sent" : (res.error ?? "Request failed")
    });
  }

  return (
    <section className="card">
      <header>
        <h2>Reset Password</h2>
        <p>Request a password reset link.</p>
      </header>
      <form onSubmit={onSubmit}>
        <FormField label="Email" name="email" type="email" error={errors.email} />
        <button type="submit" disabled={loading}>
          {loading ? "Sending..." : "Send reset link"}
        </button>
      </form>
      <FormStatus loading={loading} result={result} />
    </section>
  );
}

function ResetConfirmPage() {
  const validator = useRequiredFields(["token", "password"]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const fieldErrors = validator(data);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;
    setLoading(true);
    const res = await fetchJson("/auth/reset-confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: String(data.get("token")),
        password: String(data.get("password"))
      })
    });
    setLoading(false);
    setResult({
      ok: res.ok,
      message: res.ok ? "Password updated" : (res.error ?? "Update failed")
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
        <button type="submit" disabled={loading}>
          {loading ? "Updating..." : "Update password"}
        </button>
      </form>
      <FormStatus loading={loading} result={result} />
    </section>
  );
}

function LeaguesPage() {
  type ViewState = "loading" | "empty" | "error" | "ready";
  const [state, setState] = useState<ViewState>("loading");
  const [leagues, setLeagues] = useState<LeagueSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadLeagues = useCallback(async () => {
    setState("loading");
    setError(null);
    const res = await fetchJson<{ leagues: LeagueSummary[] }>("/leagues");
    if (!res.ok) {
      setError(res.error ?? "Failed to load leagues");
      setState("error");
      return;
    }
    setLeagues(res.data?.leagues ?? []);
    setState((res.data?.leagues?.length ?? 0) === 0 ? "empty" : "ready");
  }, []);

  useEffect(() => {
    void loadLeagues();
  }, [loadLeagues]);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError(null);
    setCreateLoading(true);
    const data = new FormData(e.currentTarget);
    const payload = {
      code: String(data.get("code") ?? "").trim(),
      name: String(data.get("name") ?? "").trim(),
      max_members: Number(data.get("max_members") ?? 10)
    };
    const res = await fetchJson<{ league: LeagueSummary }>("/leagues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    setCreateLoading(false);
    if (!res.ok) {
      setCreateError(res.error ?? "Could not create league");
      return;
    }
    e.currentTarget.reset();
    await loadLeagues();
  }

  return (
    <section className="card">
      <header className="header-with-controls">
        <div>
          <h2>Leagues</h2>
          <p>Browse or manage your leagues.</p>
        </div>
        <button type="button" onClick={loadLeagues} className="ghost">
          Refresh
        </button>
      </header>

      {state === "loading" && <PageLoader label="Loading leagues..." />}
      {state === "error" && <div className="status status-error">{error}</div>}
      {state === "empty" && (
        <div className="empty-state">
          <p className="muted">You’re not in any leagues yet.</p>
        </div>
      )}
      {state === "ready" && (
        <div className="grid">
          {leagues.map((league) => (
            <div key={league.id} className="card nested">
              <header>
                <h3>{league.name}</h3>
                <p className="muted">Code: {league.code}</p>
              </header>
              <div className="inline-actions">
                <Link to={`/leagues/${league.id}`}>Open league</Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card nested" style={{ marginTop: 16 }}>
        <header>
          <h3>Create league</h3>
          <p className="muted">Creates the initial season for the active ceremony.</p>
        </header>
        <form className="grid" onSubmit={onCreate}>
          <FormField label="Code" name="code" />
          <FormField label="Name" name="name" />
          <FormField
            label="Max members"
            name="max_members"
            type="number"
            defaultValue="10"
          />
          <div className="inline-actions">
            <button type="submit" disabled={createLoading}>
              {createLoading ? "Creating..." : "Create league"}
            </button>
            {createError && <small className="error">{createError}</small>}
          </div>
        </form>
      </div>
    </section>
  );
}

function LeagueDetailPage() {
  const { id } = useParams();
  const leagueId = Number(id);
  type ViewState = "loading" | "error" | "ready" | "forbidden";
  const [state, setState] = useState<ViewState>("loading");
  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [roster, setRoster] = useState<LeagueMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuthContext();
  const [working, setWorking] = useState(false);
  const [transferTarget, setTransferTarget] = useState<string>("");
  const [rosterStatus, setRosterStatus] = useState<ApiResult | null>(null);

  const loadDetail = useCallback(async () => {
    if (Number.isNaN(leagueId)) {
      setState("error");
      setError("Invalid league id");
      return;
    }
    setState("loading");
    setError(null);
    const [detail, seasonRes, rosterRes] = await Promise.all([
      fetchJson<{ league: LeagueDetail }>(`/leagues/${leagueId}`),
      fetchJson<{ seasons: SeasonSummary[] }>(`/leagues/${leagueId}/seasons`),
      fetchJson<{ members: LeagueMember[] }>(`/leagues/${leagueId}/members`)
    ]);

    if (!detail.ok) {
      setError(detail.error ?? "Unable to load league");
      setState(detail.errorCode === "FORBIDDEN" ? "forbidden" : "error");
      return;
    }
    setLeague(detail.data?.league ?? null);
    if (seasonRes.ok) setSeasons(seasonRes.data?.seasons ?? []);
    if (rosterRes.ok) setRoster(rosterRes.data?.members ?? null);
    else setRoster(null); // hide if forbidden
    setState("ready");
  }, [leagueId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  if (state === "loading") {
    return <PageLoader label="Loading league..." />;
  }
  if (state === "forbidden") {
    return (
      <section className="card">
        <header>
          <h2>League</h2>
          <p className="muted">Access denied.</p>
        </header>
        <PageError message="You’re not a member of this league." />
      </section>
    );
  }
  if (state === "error") {
    return (
      <section className="card">
        <header>
          <h2>League</h2>
          <p className="muted">Unable to load</p>
        </header>
        <PageError message={error ?? "Unexpected error"} />
      </section>
    );
  }

  const isCommissioner =
    !!user &&
    roster?.some(
      (m) =>
        m.user_id === Number(user.sub) && (m.role === "OWNER" || m.role === "CO_OWNER")
    );
  const isOwner =
    !!user && roster?.some((m) => m.user_id === Number(user.sub) && m.role === "OWNER");

  async function copyInvite() {
    if (!league) return;
    const link = `${window.location.origin}/leagues/${league.id}`;
    const text = `League invite code: ${league.code}\nLink: ${link}`;
    await navigator.clipboard?.writeText(text);
    setRosterStatus({ ok: true, message: "Invite copied" });
  }

  async function transferOwnership() {
    if (!transferTarget || !league) return;
    const targetId = Number(transferTarget);
    if (Number.isNaN(targetId)) return;
    if (!window.confirm("Transfer commissioner role to this member?")) return;
    setWorking(true);
    setRosterStatus(null);
    const res = await fetchJson(`/leagues/${league.id}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: targetId })
    });
    setWorking(false);
    if (res.ok) {
      setRosterStatus({ ok: true, message: "Commissioner role transferred" });
      await loadDetail();
      setTransferTarget("");
    } else {
      setRosterStatus({ ok: false, message: res.error ?? "Transfer failed" });
    }
  }

  async function removeMember(userId: number, role: string) {
    if (!league) return;
    if (role === "OWNER") return;
    if (!window.confirm("Remove this member from the league?")) return;
    setWorking(true);
    setRosterStatus(null);
    const res = await fetchJson(`/leagues/${league.id}/members/${userId}`, {
      method: "DELETE"
    });
    setWorking(false);
    if (res.ok) {
      setRoster((prev) => (prev ? prev.filter((m) => m.user_id !== userId) : prev));
      setRosterStatus({ ok: true, message: "Member removed" });
    } else {
      setRosterStatus({ ok: false, message: res.error ?? "Remove failed" });
    }
  }

  function seasonLabel(season: SeasonSummary) {
    const date = season.ceremony_starts_at ?? season.created_at;
    try {
      const year = new Date(date).getFullYear();
      if (Number.isFinite(year)) return `Season ${year}`;
    } catch {
      // ignore formatting fallback below
    }
    return `Season ${season.id}`;
  }

  return (
    <section className="card">
      <header className="header-with-controls">
        <div>
          <h2>{league?.name ?? `League #${leagueId}`}</h2>
          <p>Roster, seasons, and commissioner actions.</p>
        </div>
        <button type="button" className="ghost" onClick={loadDetail}>
          Refresh
        </button>
      </header>

      <div className="card nested">
        <header>
          <h3>Roster</h3>
          <p className="muted">Members and roles</p>
        </header>
        {roster === null ? (
          <p className="muted">Roster hidden (commissioner-only).</p>
        ) : roster.length === 0 ? (
          <p className="muted">No members yet.</p>
        ) : (
          <ul className="list">
            {roster.map((m) => (
              <li key={m.id} className="list-row">
                <span>{m.display_name || m.handle}</span>
                <span className="pill">{m.role}</span>
                {isCommissioner && m.role !== "OWNER" && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => removeMember(m.user_id, m.role)}
                    disabled={working}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {isCommissioner && (
          <div className="inline-actions" style={{ marginTop: 12 }}>
            <button type="button" onClick={copyInvite}>
              Copy invite
            </button>
            <FormStatus loading={working} result={rosterStatus} />
          </div>
        )}
      </div>

      {isCommissioner && (
        <div className="card nested" style={{ marginTop: 16 }}>
          <header>
            <h3>Commissioner Controls</h3>
            <p className="muted">
              Transfer commissioner role or remove members. Owner only for transfer.
            </p>
          </header>
          <div className="inline-actions">
            <select
              aria-label="Transfer to member"
              value={transferTarget}
              onChange={(e) => setTransferTarget(e.target.value)}
              disabled={!isOwner || working}
            >
              <option value="">Transfer to...</option>
              {roster
                ?.filter((m) => m.user_id !== Number(user?.sub))
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name || m.handle} ({m.role})
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={transferOwnership}
              disabled={!isOwner || working || !transferTarget}
            >
              Transfer commissioner
            </button>
          </div>
          <FormStatus loading={working} result={rosterStatus} />
        </div>
      )}

      <div className="card nested" style={{ marginTop: 16 }}>
        <header>
          <h3>Seasons</h3>
          <p className="muted">Active and past seasons for this league.</p>
        </header>
        {seasons.length === 0 ? (
          <p className="muted">
            No seasons yet. Created automatically on league creation.
          </p>
        ) : (
          <div className="grid">
            {seasons.map((s) => (
              <div key={s.id} className="card">
                <header>
                  <h4>{seasonLabel(s)}</h4>
                  <p className="muted">
                    {s.is_active_ceremony === false
                      ? "Archived season"
                      : "Current season"}
                  </p>
                </header>
                <div className="pill-list">
                  <span className="pill">
                    {s.is_active_ceremony === false ? "ARCHIVED" : "ACTIVE"}
                  </span>
                  <span className="pill">Status: {s.status}</span>
                  <span className="pill">Ceremony {s.ceremony_id}</span>
                  {s.remainder_strategy && (
                    <span className="pill">{allocationLabel(s.remainder_strategy)}</span>
                  )}
                  {s.draft_status && (
                    <span className="pill">Draft: {s.draft_status}</span>
                  )}
                </div>
                <div className="inline-actions">
                  <Link to={`/seasons/${s.id}`}>Open season</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SeasonPage() {
  const { id } = useParams();
  const seasonId = Number(id);
  const { user } = useAuthContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<SeasonMember[]>([]);
  const [invites, setInvites] = useState<SeasonInvite[]>([]);
  const [inviteTokens, setInviteTokens] = useState<TokenMap>({});
  const [leagueContext, setLeagueContext] = useState<{
    league: LeagueSummary;
    season: SeasonMeta;
    leagueMembers: LeagueMember[];
  } | null>(null);
  const [scoringState, setScoringState] = useState<ApiResult | null>(null);
  const [allocationState, setAllocationState] = useState<ApiResult | null>(null);
  const [addMemberResult, setAddMemberResult] = useState<ApiResult | null>(null);
  const [inviteResult, setInviteResult] = useState<ApiResult | null>(null);
  const [userInviteResult, setUserInviteResult] = useState<ApiResult | null>(null);
  const [working, setWorking] = useState(false);
  const [selectedLeagueMember, setSelectedLeagueMember] = useState<string>("");
  const [userInviteQuery, setUserInviteQuery] = useState("");
  const [placeholderLabel, setPlaceholderLabel] = useState("");
  const [labelDrafts, setLabelDrafts] = useState<Record<number, string>>({});
  const [nowTs, setNowTs] = useState(() => Date.now());

  const isCommissioner = useMemo(() => {
    if (!user) return false;
    return members.some(
      (m) =>
        m.user_id === Number(user.sub) && (m.role === "OWNER" || m.role === "CO_OWNER")
    );
  }, [members, user]);

  const isArchived = leagueContext?.season
    ? leagueContext.season.is_active_ceremony === false ||
      leagueContext.season.status !== "EXTANT"
    : false;
  const canEdit = !isArchived && isCommissioner;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const memberRes = await fetchJson<{ members: SeasonMember[] }>(
        `/seasons/${seasonId}/members`,
        { method: "GET" }
      );
      if (!memberRes.ok) {
        if (!cancelled) {
          setError(memberRes.error ?? "Could not load season");
          setLoading(false);
        }
        return;
      }
      if (!cancelled) setMembers(memberRes.data?.members ?? []);

      // Discover league + season metadata by walking user leagues.
      const leaguesRes = await fetchJson<{ leagues: LeagueSummary[] }>("/leagues", {
        method: "GET"
      });
      let found: { league: LeagueSummary; season: SeasonMeta } | null = null;
      let leagueMembers: LeagueMember[] = [];
      if (leaguesRes.ok && leaguesRes.data?.leagues) {
        for (const lg of leaguesRes.data.leagues) {
          const seasonsRes = await fetchJson<{
            seasons: Array<SeasonMeta & { id: number }>;
          }>(`/leagues/${lg.id}/seasons`, { method: "GET" });
          if (seasonsRes.ok) {
            const match = (seasonsRes.data?.seasons ?? []).find((s) => s.id === seasonId);
            if (match) {
              found = { league: lg, season: match };
              const rosterRes = await fetchJson<{ members: LeagueMember[] }>(
                `/leagues/${lg.id}/members`,
                { method: "GET" }
              );
              if (rosterRes.ok && rosterRes.data?.members) {
                leagueMembers = rosterRes.data.members;
              }
              break;
            }
          }
        }
      }
      if (!cancelled && found) {
        setLeagueContext({ ...found, leagueMembers });
      }

      const invitesRes = await fetchJson<{ invites: SeasonInvite[] }>(
        `/seasons/${seasonId}/invites`,
        { method: "GET" }
      );
      if (!cancelled && invitesRes.ok) {
        setInvites(invitesRes.data?.invites ?? []);
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [seasonId]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  async function addMember() {
    if (!selectedLeagueMember) return;
    setWorking(true);
    setAddMemberResult(null);
    const res = await fetchJson<{ member: SeasonMember }>(
      `/seasons/${seasonId}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: Number(selectedLeagueMember) })
      }
    );
    setWorking(false);
    if (res.ok && res.data?.member) {
      setMembers((prev) => [...prev, res.data!.member]);
      setAddMemberResult({ ok: true, message: "Added to season" });
      setSelectedLeagueMember("");
    } else {
      setAddMemberResult({ ok: false, message: res.error ?? "Add failed" });
    }
  }

  async function removeMember(userId: number) {
    setWorking(true);
    const res = await fetchJson(`/seasons/${seasonId}/members/${userId}`, {
      method: "DELETE"
    });
    setWorking(false);
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } else {
      setAddMemberResult({ ok: false, message: res.error ?? "Remove failed" });
    }
  }

  async function updateScoring(strategy: string) {
    setScoringState(null);
    setWorking(true);
    const res = await fetchJson<{ season: SeasonMeta }>(`/seasons/${seasonId}/scoring`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scoring_strategy_name: strategy })
    });
    setWorking(false);
    if (res.ok && res.data?.season && leagueContext) {
      setLeagueContext({
        ...leagueContext,
        season: {
          ...leagueContext.season,
          scoring_strategy_name: res.data.season.scoring_strategy_name
        }
      });
      setScoringState({ ok: true, message: "Scoring updated" });
    } else {
      setScoringState({ ok: false, message: res.error ?? "Update failed" });
    }
  }

  async function updateAllocation(strategy: string) {
    setAllocationState(null);
    setWorking(true);
    const res = await fetchJson<{ season: SeasonMeta }>(
      `/seasons/${seasonId}/allocation`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remainder_strategy: strategy })
      }
    );
    setWorking(false);
    if (res.ok && res.data?.season && leagueContext) {
      setLeagueContext({
        ...leagueContext,
        season: {
          ...leagueContext.season,
          remainder_strategy: res.data.season.remainder_strategy
        }
      });
      setAllocationState({ ok: true, message: "Allocation updated" });
    } else {
      setAllocationState({ ok: false, message: res.error ?? "Update failed" });
    }
  }

  async function createUserInvite() {
    const userId = Number(userInviteQuery);
    if (!Number.isFinite(userId)) {
      setUserInviteResult({ ok: false, message: "Enter a numeric user id" });
      return;
    }
    setWorking(true);
    setUserInviteResult(null);
    const res = await fetchJson(`/seasons/${seasonId}/user-invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId })
    });
    setWorking(false);
    setUserInviteResult({
      ok: res.ok,
      message: res.ok
        ? "Invite created (user must accept in app)"
        : (res.error ?? "Invite failed")
    });
    if (res.ok) {
      setUserInviteQuery("");
    }
  }

  async function createPlaceholderInvite() {
    setWorking(true);
    setInviteResult(null);
    const res = await fetchJson<{ invite: SeasonInvite; token: string }>(
      `/seasons/${seasonId}/invites`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          placeholderLabel.trim() ? { label: placeholderLabel.trim() } : {}
        )
      }
    );
    setWorking(false);
    if (res.ok && res.data?.invite) {
      setInvites((prev) => [res.data!.invite, ...prev]);
      setInviteTokens((prev) => ({ ...prev, [res.data!.invite.id]: res.data!.token }));
      setPlaceholderLabel("");
      setInviteResult({ ok: true, message: "Link generated" });
    } else {
      setInviteResult({ ok: false, message: res.error ?? "Invite failed" });
    }
  }

  async function revokeInvite(inviteId: number) {
    setWorking(true);
    const res = await fetchJson<{ invite: SeasonInvite }>(
      `/seasons/${seasonId}/invites/${inviteId}/revoke`,
      { method: "POST" }
    );
    setWorking(false);
    if (res.ok && res.data?.invite) {
      setInvites((prev) => prev.map((i) => (i.id === inviteId ? res.data!.invite : i)));
    } else {
      setInviteResult({ ok: false, message: res.error ?? "Revoke failed" });
    }
  }

  async function regenerateInvite(inviteId: number) {
    setWorking(true);
    const res = await fetchJson<{ invite: SeasonInvite; token: string }>(
      `/seasons/${seasonId}/invites/${inviteId}/regenerate`,
      { method: "POST" }
    );
    setWorking(false);
    if (res.ok && res.data?.invite) {
      setInvites((prev) => prev.map((i) => (i.id === inviteId ? res.data!.invite : i)));
      setInviteTokens((prev) => ({ ...prev, [res.data!.invite.id]: res.data!.token }));
      setInviteResult({ ok: true, message: "New link generated" });
    } else {
      setInviteResult({ ok: false, message: res.error ?? "Regenerate failed" });
    }
  }

  async function saveInviteLabel(inviteId: number) {
    const nextLabel = labelDrafts[inviteId] ?? "";
    setWorking(true);
    const res = await fetchJson<{ invite: SeasonInvite }>(
      `/seasons/${seasonId}/invites/${inviteId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: nextLabel.trim() || null })
      }
    );
    setWorking(false);
    if (res.ok && res.data?.invite) {
      setInvites((prev) => prev.map((i) => (i.id === inviteId ? res.data!.invite : i)));
      setInviteResult({ ok: true, message: "Label saved" });
    } else {
      setInviteResult({ ok: false, message: res.error ?? "Save failed" });
    }
  }

  function formatDate(value?: string | null) {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  }

  function buildInviteLink(inviteId: number) {
    const token = inviteTokens[inviteId];
    const pathToken = token ?? String(inviteId);
    return `${window.location.origin}/invites/${pathToken}`;
  }

  function copyLink(inviteId: number) {
    const link = buildInviteLink(inviteId);
    void navigator.clipboard?.writeText(link);
    setInviteResult({ ok: true, message: "Link copied" });
  }

  if (loading) {
    return <PageLoader label="Loading season..." />;
  }
  if (error) {
    return (
      <section className="card">
        <header>
          <h2>Season {id}</h2>
          <p className="muted">Could not load season data.</p>
        </header>
        <div className="status status-error">{error}</div>
      </section>
    );
  }

  const seasonStatus = leagueContext?.season?.status ?? "UNKNOWN";
  const scoringStrategy = leagueContext?.season?.scoring_strategy_name ?? "fixed";
  const allocationStrategy = leagueContext?.season?.remainder_strategy ?? "UNDRAFTED";
  const availableLeagueMembers =
    leagueContext?.leagueMembers?.filter(
      (m) => !members.some((sm) => sm.user_id === m.user_id)
    ) ?? [];
  const ceremonyStartsAt = leagueContext?.season?.ceremony_starts_at ?? null;
  const draftId = leagueContext?.season?.draft_id ?? null;
  const draftStatus = leagueContext?.season?.draft_status ?? null;
  const draftWarningEligible =
    (leagueContext?.season?.is_active_ceremony ?? false) &&
    draftStatus &&
    (draftStatus === "PENDING" ||
      draftStatus === "IN_PROGRESS" ||
      draftStatus === "PAUSED");
  const integrityWarningActive =
    draftWarningEligible && isIntegrityWarningWindow(ceremonyStartsAt, nowTs);

  return (
    <section className="card">
      <header className="header-with-controls">
        <div>
          <h2>Season {id}</h2>
          <p className="muted">
            {leagueContext?.league?.name
              ? `League ${leagueContext.league.name} • Ceremony ${leagueContext.league.ceremony_id}`
              : "Season participants and invites"}
          </p>
        </div>
        <div className="pill-list">
          <span className="pill">Status: {seasonStatus}</span>
          <span className="pill">{isArchived ? "ARCHIVED (read-only)" : "ACTIVE"}</span>
          <span className="pill">Scoring: {scoringStrategy}</span>
          <span className="pill">Allocation: {allocationLabel(allocationStrategy)}</span>
        </div>
      </header>
      {isArchived && (
        <div className="status status-info" role="status">
          Archived season: roster, invites, and scoring are locked. Draft room and
          standings remain view-only year-round.
        </div>
      )}

      <div className="card nested">
        <header className="header-with-controls">
          <div>
            <h3>Draft Room</h3>
            <p className="muted">Join the live draft for this season.</p>
          </div>
          <div className="inline-actions">
            {draftId ? (
              <Link to={`/drafts/${draftId}`}>Enter draft room</Link>
            ) : (
              <span className="pill">Draft not created yet</span>
            )}
          </div>
        </header>
        {isArchived && (
          <p className="muted">
            Past season — draft actions are locked; results remain viewable.
          </p>
        )}
        {integrityWarningActive && (
          <div className="status status-warning" role="status">
            Heads up: once winners start getting entered after the ceremony begins,
            drafting stops immediately. If you’re in the room then, it ends just like a
            cancellation.
          </div>
        )}
        {leagueContext?.season?.draft_status && (
          <p className="muted">
            Timer:{" "}
            {leagueContext.season.pick_timer_seconds
              ? `${leagueContext.season.pick_timer_seconds}s per pick (auto-pick: next available)`
              : "Off"}
          </p>
        )}
        {ceremonyStartsAt && (
          <p className="muted">
            Ceremony starts {formatDate(ceremonyStartsAt)} (warning window: 24h prior).
          </p>
        )}
        {!draftId && (
          <p className="muted">The commissioner will create the draft for this season.</p>
        )}
      </div>

      <div className="grid two-col">
        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h3>Participants</h3>
              <p className="muted">Season roster (league members only).</p>
            </div>
          </header>
          {isArchived && (
            <div className="status status-info" role="status">
              Roster locked (archived season).
            </div>
          )}
          {members.length === 0 ? (
            <p className="muted">No participants yet.</p>
          ) : (
            <ul className="list">
              {members.map((m) => {
                const leagueProfile = leagueContext?.leagueMembers?.find(
                  (lm) => lm.user_id === m.user_id
                );
                return (
                  <li key={m.user_id} className="list-row">
                    <span>
                      {leagueProfile?.display_name ?? `User ${m.user_id}`}{" "}
                      <span className="muted">({leagueProfile?.handle ?? "—"})</span>
                    </span>
                    <span className="pill">{m.role}</span>
                    {canEdit && m.role !== "OWNER" && (
                      <button
                        type="button"
                        className="ghost"
                        disabled={working}
                        onClick={() => removeMember(m.user_id)}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {canEdit && (
            <>
              <div className="inline-actions">
                <select
                  value={selectedLeagueMember}
                  onChange={(e) => setSelectedLeagueMember(e.target.value)}
                  aria-label="Select league member"
                >
                  <option value="">Add league member...</option>
                  {availableLeagueMembers.map((lm) => (
                    <option key={lm.user_id} value={lm.user_id}>
                      {lm.display_name} ({lm.handle})
                    </option>
                  ))}
                </select>
                <button type="button" onClick={addMember} disabled={working}>
                  Add to season
                </button>
              </div>
              <FormStatus loading={working} result={addMemberResult} />
            </>
          )}
        </div>

        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h3>Commissioner Controls</h3>
              <p className="muted">Scoring + invites. Draft must be pending.</p>
            </div>
          </header>
          {isArchived ? (
            <p className="muted">
              Archived season — scoring and invites are read-only. No edits allowed.
            </p>
          ) : (
            <div className="stack">
              <div>
                <label className="field">
                  <span>Scoring strategy</span>
                  <select
                    value={scoringStrategy}
                    disabled={!canEdit || working}
                    onChange={(e) => updateScoring(e.target.value)}
                  >
                    <option value="fixed">Fixed</option>
                    <option value="negative">Negative</option>
                  </select>
                </label>
                <FormStatus loading={working} result={scoringState} />
              </div>

              <div>
                <label className="field">
                  <span>Allocation for remainder picks</span>
                  <select
                    value={allocationStrategy}
                    disabled={!canEdit || working}
                    onChange={(e) => updateAllocation(e.target.value)}
                  >
                    <option value="UNDRAFTED">Leave extras undrafted</option>
                    <option value="FULL_POOL">Use full pool (extras drafted)</option>
                  </select>
                </label>
                <FormStatus loading={working} result={allocationState} />
              </div>

              <div className="inline-form">
                <label className="field">
                  <span>User ID to invite</span>
                  <input
                    name="user_id"
                    type="number"
                    value={userInviteQuery}
                    onChange={(e) => setUserInviteQuery(e.target.value)}
                    disabled={!canEdit || working}
                  />
                </label>
                <button
                  type="button"
                  onClick={createUserInvite}
                  disabled={!canEdit || working}
                >
                  Invite user (targeted)
                </button>
              </div>
              <FormStatus loading={working} result={userInviteResult} />

              <div className="inline-form">
                <label className="field">
                  <span>Placeholder label (optional)</span>
                  <input
                    name="label"
                    type="text"
                    value={placeholderLabel}
                    onChange={(e) => setPlaceholderLabel(e.target.value)}
                    disabled={!canEdit || working}
                  />
                </label>
                <button
                  type="button"
                  onClick={createPlaceholderInvite}
                  disabled={!canEdit || working}
                >
                  Generate claim link
                </button>
              </div>
              <FormStatus loading={working} result={inviteResult} />
            </div>
          )}
        </div>
      </div>

      <div className="card nested">
        <header className="header-with-controls">
          <div>
            <h3>Invites</h3>
            <p className="muted">
              Placeholder links + statuses. Regenerate to refresh tokens; copy from the
              rows.
            </p>
          </div>
        </header>
        {isArchived && (
          <div className="status status-info" role="status">
            Archived season — invites are locked. Existing links remain for reference.
          </div>
        )}
        {invites.length === 0 ? (
          <p className="muted">No invites yet.</p>
        ) : (
          <div className="invite-table">
            {invites.map((invite) => (
              <div key={invite.id} className="list-row">
                <div>
                  <div className="pill-list">
                    <span className="pill">#{invite.id}</span>
                    <span className="pill">{invite.kind}</span>
                    <span className="pill">{invite.status}</span>
                  </div>
                  <p className="muted">
                    Created {formatDate(invite.created_at)} • Claimed{" "}
                    {formatDate(invite.claimed_at)}
                  </p>
                  <input
                    className="inline-input"
                    type="text"
                    aria-label="Invite label"
                    value={labelDrafts[invite.id] ?? invite.label ?? ""}
                    disabled={!canEdit || working || invite.status !== "PENDING"}
                    onChange={(e) =>
                      setLabelDrafts((prev) => ({ ...prev, [invite.id]: e.target.value }))
                    }
                  />
                </div>
                <div className="pill-actions">
                  <button
                    type="button"
                    className="ghost"
                    disabled={!inviteTokens[invite.id]}
                    onClick={() => copyLink(invite.id)}
                  >
                    Copy link
                  </button>
                  {canEdit && invite.status === "PENDING" && (
                    <>
                      <button
                        type="button"
                        onClick={() => saveInviteLabel(invite.id)}
                        disabled={working}
                      >
                        Save label
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => revokeInvite(invite.id)}
                        disabled={working}
                      >
                        Revoke
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => regenerateInvite(invite.id)}
                        disabled={working}
                      >
                        Regenerate
                      </button>
                    </>
                  )}
                </div>
                {inviteTokens[invite.id] && (
                  <small className="muted">Share: {buildInviteLink(invite.id)}</small>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function InviteClaimPage() {
  const { token } = useParams();
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  function mapInviteError(code?: string, fallback?: string) {
    switch (code) {
      case "SEASON_CANCELLED":
        return "This season was cancelled. Invites can’t be claimed.";
      case "INVITE_REVOKED":
        return "This invite was revoked. Ask the commissioner for a new link.";
      case "INVITE_NOT_FOUND":
        return "Invite not found or already claimed.";
      default:
        return fallback ?? "Invite is invalid or expired";
    }
  }

  async function accept() {
    if (!token) {
      setResult({ ok: false, message: "Invalid invite link" });
      return;
    }
    setLoading(true);
    const res = await fetchJson<{ invite?: { season_id?: number } }>(
      `/seasons/invites/${token}/accept`,
      { method: "POST" }
    );
    setLoading(false);
    if (!res.ok) {
      setResult({
        ok: false,
        message: mapInviteError(res.errorCode, res.error)
      });
      return;
    }
    setResult({ ok: true, message: "Invite accepted" });
    const nextSeasonId = res.data?.invite?.season_id;
    if (nextSeasonId) navigate(`/seasons/${nextSeasonId}`, { replace: true });
    else navigate("/leagues", { replace: true });
  }

  async function decline() {
    if (!token) {
      setResult({ ok: false, message: "Invalid invite link" });
      return;
    }
    setLoading(true);
    const res = await fetchJson(`/seasons/invites/${token}/decline`, {
      method: "POST"
    });
    setLoading(false);
    setResult({
      ok: res.ok,
      message: res.ok ? "Invite declined" : (res.error ?? "Decline failed")
    });
  }

  return (
    <section className="card">
      <header className="header-with-controls">
        <div>
          <h2>Invite</h2>
          <p>Claim a league invite.</p>
        </div>
      </header>
      <div className="stack">
        <p className="muted">
          You’ve been invited to join a league. Accept to join the season roster.
        </p>
        <div className="inline-actions">
          <button type="button" onClick={accept} disabled={loading}>
            {loading ? "Working..." : "Accept invite"}
          </button>
          <button type="button" className="ghost" onClick={decline} disabled={loading}>
            Decline
          </button>
        </div>
        <small className="muted">Invite: {token}</small>
        <FormStatus loading={loading} result={result} />
      </div>
    </section>
  );
}

function InvitesInboxPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invites, setInvites] = useState<InboxInvite[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const res = await fetchJson<{ invites: InboxInvite[] }>("/seasons/invites/inbox", {
        method: "GET"
      });
      if (!res.ok) {
        if (!cancelled) {
          setError(res.error ?? "Could not load invites");
          setLoading(false);
        }
        return;
      }
      if (!cancelled) {
        setInvites(res.data?.invites ?? []);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function accept(invite: InboxInvite) {
    const res = await fetchJson<{ invite?: SeasonInvite }>(
      `/seasons/invites/${invite.id}/accept`,
      { method: "POST" }
    );
    if (!res.ok) {
      setError(res.error ?? "Unable to accept invite");
      return;
    }
    setInvites((prev) => prev.filter((i) => i.id !== invite.id));

    // Try to navigate to season if extant; otherwise league fallback.
    if (invite.league_id) {
      const seasonsRes = await fetchJson<{ seasons: SeasonMeta[] }>(
        `/leagues/${invite.league_id}/seasons`,
        { method: "GET" }
      );
      if (seasonsRes.ok) {
        const seasonMeta = (seasonsRes.data?.seasons ?? []).find(
          (s) => s.id === invite.season_id
        );
        if (seasonMeta && seasonMeta.status === "EXTANT") {
          navigate(`/seasons/${invite.season_id}`, { replace: true });
          return;
        }
      }
      navigate(`/leagues/${invite.league_id}`, { replace: true });
      return;
    }
    navigate("/leagues", { replace: true });
  }

  async function decline(invite: InboxInvite) {
    const res = await fetchJson(`/seasons/invites/${invite.id}/decline`, {
      method: "POST"
    });
    if (!res.ok) {
      setError(res.error ?? "Unable to decline invite");
      return;
    }
    setInvites((prev) => prev.filter((i) => i.id !== invite.id));
  }

  if (loading) return <PageLoader label="Loading invites..." />;

  return (
    <section className="card">
      <header className="header-with-controls">
        <div>
          <h2>Invites</h2>
          <p className="muted">Accept or decline season invites sent to you.</p>
        </div>
      </header>
      {error && <div className="status status-error">{error}</div>}
      {invites.length === 0 ? (
        <p className="muted">No pending invites.</p>
      ) : (
        <div className="list">
          {invites.map((invite) => (
            <div key={invite.id} className="list-row">
              <div>
                <div className="pill-list">
                  <span className="pill">#{invite.id}</span>
                  {invite.league_name && (
                    <span className="pill">{invite.league_name}</span>
                  )}
                  {invite.ceremony_id && (
                    <span className="pill">Ceremony {invite.ceremony_id}</span>
                  )}
                </div>
                <p className="muted">
                  Season {invite.season_id} • {invite.kind}
                </p>
              </div>
              <div className="pill-actions">
                <button type="button" onClick={() => accept(invite)}>
                  Accept
                </button>
                <button type="button" className="ghost" onClick={() => decline(invite)}>
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type Snapshot = {
  draft: {
    id: number;
    status: string;
    current_pick_number: number | null;
    version?: number;
    started_at?: string | null;
    completed_at?: string | null;
    pick_timer_seconds?: number | null;
    pick_deadline_at?: string | null;
    pick_timer_remaining_ms?: number | null;
    auto_pick_strategy?: string | null;
  };
  seats: Array<{ seat_number: number; league_member_id: number; user_id?: number }>;
  picks: Array<{ pick_number: number; seat_number: number; nomination_id: number }>;
  version: number;
  picks_per_seat?: number | null;
  total_picks?: number | null;
  remainder_strategy?: string;
  ceremony_starts_at?: string | null;
};

type DraftEventMessage = {
  draft_id: number;
  version: number;
  event_type: string;
  payload?: {
    draft?: {
      status?: string;
      current_pick_number?: number | null;
      completed_at?: string | null;
      started_at?: string | null;
    };
    pick?: {
      pick_number: number;
      seat_number: number;
      nomination_id: number;
    };
  };
  created_at: string;
};

function mapPickError(code?: string, fallback?: string) {
  switch (code) {
    case "NOT_ACTIVE_TURN":
      return "It is not your turn. Wait for the active seat to pick.";
    case "NOMINATION_ALREADY_PICKED":
      return "That nomination is already picked. Choose another nomination.";
    case "DRAFT_NOT_IN_PROGRESS":
      return "Draft is not in progress. Refresh the draft state.";
    case "PREREQ_MISSING_SEATS":
      return "Draft has no seats configured. Ask the commissioner to set seats.";
    case "PREREQ_MISSING_NOMINATIONS":
      return "Nominees not loaded. Ask the commissioner to load nominees.";
    default:
      return fallback ?? "Pick failed. Please try again.";
  }
}

function isIntegrityWarningWindow(
  startsAt?: string | null,
  nowMs: number = Date.now()
): boolean {
  if (!startsAt) return false;
  const startMs = new Date(startsAt).getTime();
  if (!Number.isFinite(startMs)) return false;
  const windowStart = startMs - 24 * 60 * 60 * 1000;
  return nowMs >= windowStart && nowMs < startMs;
}

function formatTimer(draft: Snapshot["draft"], nowMs: number) {
  if (!draft.pick_timer_seconds) return "Off";
  if (draft.status !== "IN_PROGRESS") return "Paused/idle";
  const deadline = draft.pick_deadline_at
    ? new Date(draft.pick_deadline_at).getTime()
    : null;
  if (!deadline) return `${draft.pick_timer_seconds}s (no deadline set)`;
  const remaining = Math.max(0, deadline - nowMs);
  const seconds = Math.round(remaining / 1000);
  return `${draft.pick_timer_seconds}s • ${seconds}s left`;
}

// Legacy harness kept for reference (not routed in skeleton mode).
export function DraftRoom(props: {
  initialDraftId?: string | number;
  disabled?: boolean;
}) {
  const { initialDraftId, disabled } = props;
  const [draftId, setDraftId] = useState(String(initialDraftId ?? "1"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [pickNominationId, setPickNominationId] = useState("");
  const [pickState, setPickState] = useState<ApiResult | null>(null);
  const [pickLoading, setPickLoading] = useState(false);
  const [startState, setStartState] = useState<ApiResult | null>(null);
  const [startLoading, setStartLoading] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "reconnecting" | "disconnected"
  >("disconnected");
  const socketRef = useRef<Socket | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const [lastVersion, setLastVersion] = useState<number | null>(null);
  const lastVersionRef = useRef<number | null>(null);
  const [desynced, setDesynced] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const needsReconnectSyncRef = useRef(false);

  useEffect(() => {
    if (!snapshot && !loading && draftId) {
      void loadSnapshot(draftId);
    }
  }, [draftId, loading, snapshot]);

  async function loadSnapshot(id: string, options?: { preserveSnapshot?: boolean }) {
    setLoading(true);
    setError(null);
    if (!options?.preserveSnapshot) {
      setSnapshot(null);
    }
    const res = await fetchJson<Snapshot>(`/drafts/${id}/snapshot`, { method: "GET" });
    if (res.ok && res.data) {
      const normalized = {
        ...res.data,
        draft: {
          ...res.data.draft,
          version: res.data.draft.version ?? res.data.version
        }
      };
      setSnapshot(normalized);
      setLastVersion(normalized.version);
      if (!options?.preserveSnapshot) {
        setDesynced(false);
        setResyncing(false);
      }
      setLoading(false);
      return true;
    } else {
      setError(res.error ?? "Failed to load snapshot");
      if (!options?.preserveSnapshot) {
        setResyncing(false);
      }
    }
    setLoading(false);
    return false;
  }

  const activeSeatNumber = useMemo(() => {
    if (!snapshot?.draft.current_pick_number || snapshot.seats.length === 0) return null;
    const pickNumber = snapshot.draft.current_pick_number;
    const seatCount = snapshot.seats.length;
    const round = Math.ceil(pickNumber / seatCount);
    const idx = (pickNumber - 1) % seatCount;
    return round % 2 === 1 ? idx + 1 : seatCount - idx;
  }, [snapshot]);

  const mySeatNumber = useMemo(() => {
    if (!snapshot) return null;
    return null; // MVP: omit per-user mapping in web shell
  }, [snapshot]);

  const canPick =
    !!snapshot &&
    snapshot.draft.status === "IN_PROGRESS" &&
    activeSeatNumber !== null &&
    mySeatNumber === activeSeatNumber &&
    !disabled;

  const pickDisabledReason = useMemo(() => {
    if (disabled) return "Sign in to make picks.";
    if (!snapshot) return "Load a draft snapshot first.";
    if (snapshot.draft.status === "PAUSED") return "Draft is paused.";
    if (snapshot.draft.status === "CANCELLED") return "Season cancelled.";
    if (snapshot.draft.status !== "IN_PROGRESS") return "Draft is not in progress.";
    if (activeSeatNumber === null) return "Turn information unavailable.";
    if (mySeatNumber === null) return "You are not seated in this draft.";
    if (activeSeatNumber !== mySeatNumber)
      return `Waiting for seat ${activeSeatNumber} to pick.`;
    return null;
  }, [disabled, snapshot, activeSeatNumber, mySeatNumber]);

  const submitPick = useCallback(async () => {
    if (!snapshot) return;
    const nominationIdNum = Number(pickNominationId);
    if (!Number.isFinite(nominationIdNum) || nominationIdNum <= 0) {
      setPickState({ ok: false, message: "Enter a valid nomination id." });
      return;
    }
    setPickLoading(true);
    setPickState(null);
    const requestId =
      crypto?.randomUUID?.() ??
      `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await fetchJson(`/drafts/${snapshot.draft.id}/picks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nomination_id: nominationIdNum, request_id: requestId })
    });
    if (res.ok) {
      setPickState({ ok: true, message: "Pick submitted" });
      setPickNominationId("");
      await loadSnapshot(String(snapshot.draft.id));
    } else {
      const reason = mapPickError(res.errorCode, res.error);
      setPickState({ ok: false, message: reason });
    }
    setPickLoading(false);
  }, [pickNominationId, snapshot]);

  const canStartDraft =
    !!snapshot && snapshot.draft.status === "PENDING" && !disabled && !startLoading;

  const integrityWarningActive = useMemo(() => {
    if (!snapshot) return false;
    const status = snapshot.draft.status;
    const relevantStatus =
      status === "PENDING" || status === "IN_PROGRESS" || status === "PAUSED";
    if (!relevantStatus) return false;
    return isIntegrityWarningWindow(snapshot.ceremony_starts_at, nowTs);
  }, [snapshot, nowTs]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    lastVersionRef.current = lastVersion;
  }, [lastVersion]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const draftIdForSocket = snapshot?.draft.id;
    if (!draftIdForSocket || disabled) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setConnectionStatus("disconnected");
      setDesynced(false);
      setResyncing(false);
      return;
    }

    const socketBase = API_BASE
      ? new URL(API_BASE, window.location.origin).origin
      : window.location.origin;
    const socket = io(`${socketBase}/drafts`, {
      transports: ["websocket"],
      autoConnect: false,
      auth: { draftId: Number(draftIdForSocket) }
    });
    socketRef.current = socket;

    const triggerReconnectSync = () => {
      if (!needsReconnectSyncRef.current) return;
      needsReconnectSyncRef.current = false;
      const current = snapshotRef.current;
      if (!current) return;
      void loadSnapshot(String(current.draft.id), { preserveSnapshot: true });
    };
    const onConnect = () => {
      setConnectionStatus("connected");
      triggerReconnectSync();
    };
    const onDisconnect = () => {
      needsReconnectSyncRef.current = true;
      setConnectionStatus("disconnected");
    };
    const onConnectError = () => setConnectionStatus("disconnected");
    const onReconnectAttempt = () => setConnectionStatus("reconnecting");
    const onReconnect = () => {
      setConnectionStatus("connected");
      triggerReconnectSync();
    };
    const onReconnectFailed = () => setConnectionStatus("disconnected");

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.io.on("reconnect", onReconnect);
    socket.io.on("reconnect_failed", onReconnectFailed);
    const onDraftEvent = (event: DraftEventMessage) => {
      const current = snapshotRef.current;
      const currentVersion = lastVersionRef.current;
      if (!current || currentVersion === null) return;
      if (event.draft_id !== current.draft.id) return;
      if (event.event_type === "season.cancelled") {
        setPickState({ ok: false, message: "Season cancelled. Draft closed." });
        setSnapshot(null);
        socket.disconnect();
        return;
      }
      if (event.version > currentVersion + 1) {
        setDesynced(true);
        setResyncing(true);
        void loadSnapshot(String(current.draft.id), { preserveSnapshot: true }).then(
          (ok) => {
            setResyncing(false);
            if (ok) setDesynced(false);
          }
        );
        return;
      }
      if (event.version !== currentVersion + 1) return;

      setSnapshot((prev) => {
        if (!prev || prev.draft.id !== event.draft_id) return prev;
        const nextDraft = { ...prev.draft };
        if (event.payload?.draft) {
          if (event.payload.draft.status) {
            nextDraft.status = event.payload.draft.status;
          }
          if ("current_pick_number" in event.payload.draft) {
            nextDraft.current_pick_number =
              event.payload.draft.current_pick_number ?? null;
          }
          if (event.payload.draft.completed_at !== undefined) {
            nextDraft.completed_at = event.payload.draft.completed_at ?? null;
          }
          if (event.payload.draft.started_at !== undefined) {
            nextDraft.started_at = event.payload.draft.started_at ?? null;
          }
        }
        nextDraft.version = event.version;
        const nextPick = event.payload?.pick;
        const nextPicks = nextPick
          ? prev.picks.some((pick) => pick.pick_number === nextPick.pick_number)
            ? prev.picks
            : [...prev.picks, nextPick].sort((a, b) => a.pick_number - b.pick_number)
          : prev.picks;
        return {
          ...prev,
          draft: nextDraft,
          picks: nextPicks,
          version: event.version
        };
      });
      setLastVersion(event.version);
    };
    socket.on("draft:event", onDraftEvent);

    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("draft:event", onDraftEvent);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.io.off("reconnect", onReconnect);
      socket.io.off("reconnect_failed", onReconnectFailed);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [snapshot?.draft.id, disabled]);

  const startDraft = useCallback(async () => {
    if (!snapshot) return;
    setStartLoading(true);
    setStartState(null);
    const res = await fetchJson<{ draft: Snapshot["draft"] }>(
      `/drafts/${snapshot.draft.id}/start`,
      { method: "POST", headers: { "Content-Type": "application/json" } }
    );
    if (res.ok) {
      setStartState({ ok: true, message: "Draft started" });
      await loadSnapshot(String(snapshot.draft.id));
    } else {
      setStartState({
        ok: false,
        message: res.error ?? "Failed to start draft"
      });
    }
    setStartLoading(false);
  }, [snapshot]);

  return (
    <section className="card draft-card">
      <header>
        <h2>Draft Room</h2>
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
        <>
          <div className="draft-grid">
            <div className="summary">
              <p className="eyebrow">Draft #{snapshot.draft?.id ?? "?"}</p>
              <h3>Status: {snapshot.draft?.status ?? "UNKNOWN"}</h3>
              <p className="muted">
                Current pick: {snapshot.draft?.current_pick_number ?? "—"} · Version{" "}
                {snapshot.version}
              </p>
              <p className="muted">
                Timer: {formatTimer(snapshot.draft, nowTs)}{" "}
                {snapshot.draft.auto_pick_strategy
                  ? `• Auto-pick: ${snapshot.draft.auto_pick_strategy}`
                  : ""}
              </p>
              <p className="muted">
                Allocation: {allocationLabel(snapshot.remainder_strategy)} · Total picks:{" "}
                {snapshot.total_picks ?? "—"}
              </p>
              <div className="status-tray">
                <span
                  className="connection-status"
                  data-state={connectionStatus}
                  role="status"
                  aria-live="polite"
                >
                  {connectionStatus === "connected" && "Connected"}
                  {connectionStatus === "reconnecting" && "Reconnecting..."}
                  {connectionStatus === "disconnected" && "Disconnected"}
                </span>
                {desynced && (
                  <span
                    className="status-pill"
                    role="status"
                    aria-live="polite"
                    aria-label="Draft desynced"
                  >
                    {resyncing ? "Resyncing..." : "Desynced"}
                  </span>
                )}
              </div>
              {integrityWarningActive && (
                <div className="status status-warning" role="status">
                  Heads up: once winners start getting entered after the ceremony begins,
                  drafting stops immediately. If you’re in the room when that happens, it
                  ends just like a commissioner cancellation.
                </div>
              )}
              {snapshot.draft.status === "PENDING" && (
                <div className="inline-actions">
                  <button type="button" onClick={startDraft} disabled={!canStartDraft}>
                    {startLoading ? "Starting..." : "Start draft"}
                  </button>
                </div>
              )}
              {startState && (
                <FormStatus
                  loading={startLoading}
                  result={startState}
                  onRetry={startDraft}
                />
              )}
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
          <div className="pick-panel">
            <h4>Make a pick</h4>
            <p className="muted">Active seat: {activeSeatNumber ?? "—"}</p>
            <div className="inline-form">
              <label className="field">
                <span>Nomination ID</span>
                <input
                  value={pickNominationId}
                  onChange={(e) => setPickNominationId(e.target.value)}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="e.g. 12"
                  disabled={!canPick}
                />
              </label>
              <button
                type="button"
                onClick={submitPick}
                disabled={!canPick || pickLoading}
              >
                {pickLoading ? "Submitting..." : "Submit pick"}
              </button>
            </div>
            {pickDisabledReason && (
              <div className="status status-error">{pickDisabledReason}</div>
            )}
            <FormStatus loading={pickLoading} result={pickState} />
          </div>
        </>
      )}
    </section>
  );
}

function DraftRoomPage() {
  const { id } = useParams();
  return <DraftRoom initialDraftId={id} />;
}

function ResultsPage() {
  type ViewState = "loading" | "unavailable" | "error" | "ready";
  const [state, setState] = useState<ViewState>("loading");
  const [draftId, setDraftId] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [winners, setWinners] = useState<
    Array<{ category_edition_id: number; nomination_id: number }>
  >([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const winnerNominationIds = useMemo(
    () => new Set(winners.map((w) => w.nomination_id)),
    [winners]
  );

  const standings = useMemo(() => {
    if (!snapshot) return [];
    const seatScores: Record<number, { seat: number; points: number }> = {};
    for (const seat of snapshot.seats) {
      seatScores[seat.seat_number] = { seat: seat.seat_number, points: 0 };
    }
    for (const pick of snapshot.picks) {
      if (winnerNominationIds.has(pick.nomination_id)) {
        seatScores[pick.seat_number].points += 1;
      }
    }
    return Object.values(seatScores).sort((a, b) => b.points - a.points);
  }, [snapshot, winnerNominationIds]);

  const picksWithResult = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.picks
      .slice()
      .sort((a, b) => a.pick_number - b.pick_number)
      .map((p) => ({
        ...p,
        isWinner: winnerNominationIds.has(p.nomination_id)
      }));
  }, [snapshot, winnerNominationIds]);

  useEffect(() => {
    async function load() {
      setState("loading");
      setError(null);
      const winnersRes = await fetchJson<{
        winners: Array<{ category_edition_id: number; nomination_id: number }>;
      }>("/ceremony/active/winners", { method: "GET" });
      if (!winnersRes.ok) {
        setError(winnersRes.error ?? "Failed to load winners");
        setState("error");
        return;
      }
      const snapshotRes = await fetchJson<Snapshot>(`/drafts/${draftId}/snapshot`, {
        method: "GET"
      });
      if (!snapshotRes.ok) {
        setError(snapshotRes.error ?? "Failed to load draft results");
        setState("error");
        return;
      }
      setWinners(winnersRes.data?.winners ?? []);
      setSnapshot(snapshotRes.data ?? null);
      if (!winnersRes.data?.winners?.length) {
        setState("unavailable");
        return;
      }
      setState("ready");
    }
    void load();
  }, [draftId]);

  function renderState() {
    if (state === "loading") {
      return (
        <div className="status status-loading" role="status">
          <span className="spinner" aria-hidden="true" /> Loading results…
        </div>
      );
    }
    if (state === "unavailable") {
      return (
        <div className="status status-warning" role="status">
          Results are not available yet. Winners publish once the ceremony begins; drafts
          lock as soon as the first winner is entered.
        </div>
      );
    }
    if (state === "error") {
      return (
        <div className="status status-error" role="status">
          {error ?? "Could not load results right now. Try again shortly."}
        </div>
      );
    }
    if (!snapshot) {
      return (
        <div className="status status-error" role="status">
          No draft snapshot available.
        </div>
      );
    }

    return (
      <div className="stack-lg">
        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h3>Winners</h3>
              <p className="muted">
                Final winners by category. Drafting is locked once the first winner is
                recorded.
              </p>
            </div>
          </header>
          {winners.length === 0 ? (
            <p className="muted">No winners published yet.</p>
          ) : (
            <div className="grid">
              {winners.map((w) => {
                const draftedBySeat = snapshot.picks.find(
                  (p) => p.nomination_id === w.nomination_id
                )?.seat_number;
                return (
                  <div
                    key={`${w.category_edition_id}-${w.nomination_id}`}
                    className="list-row"
                  >
                    <div>
                      <p className="eyebrow">Category {w.category_edition_id}</p>
                      <strong>Nomination #{w.nomination_id}</strong>
                    </div>
                    <div className="pill-list">
                      <span className="pill success">Winner</span>
                      {draftedBySeat ? (
                        <span className="pill">Drafted by seat {draftedBySeat}</span>
                      ) : (
                        <span className="pill muted">Not drafted</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h3>Season standings</h3>
              <p className="muted">Points by draft seat (1 point per winner drafted).</p>
            </div>
          </header>
          <div className="table">
            <div className="table-row table-head">
              <span>Seat</span>
              <span>Points</span>
            </div>
            {standings.map((row) => (
              <div key={row.seat} className="table-row">
                <span>Seat {row.seat}</span>
                <span>{row.points}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h3>Pick log</h3>
              <p className="muted">Seat picks with win/loss markers.</p>
            </div>
          </header>
          <ul className="list">
            {picksWithResult.map((p) => (
              <li key={p.pick_number} className="list-row">
                <span className="pill">Seat {p.seat_number}</span>
                <span>
                  Pick #{p.pick_number}: nomination {p.nomination_id}
                </span>
                <span className={`pill ${p.isWinner ? "success" : "muted"}`}>
                  {p.isWinner ? "Win" : "Loss"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <section className="card">
      <header className="header-with-controls">
        <div>
          <h2>Results</h2>
          <p className="muted">
            Winners + standings (read-only). Drafting locks the moment the first winner is
            entered.
          </p>
        </div>
        <div className="inline-actions">
          <label className="field">
            <span>Draft ID</span>
            <input
              value={draftId}
              onChange={(e) => setDraftId(e.target.value)}
              inputMode="numeric"
              pattern="[0-9]*"
            />
          </label>
          <button type="button" onClick={() => setState("loading")}>
            Refresh
          </button>
        </div>
      </header>
      {renderState()}
    </section>
  );
}

function AccountPage() {
  const { user, logout } = useAuthContext();
  return (
    <section className="card">
      <header>
        <h2>Account</h2>
        <p>Manage your profile and security.</p>
      </header>
      <div className="stack">
        <p className="muted">Signed in as {user?.handle ?? user?.sub ?? "unknown"}.</p>
        <ul className="pill-list">
          <li className="pill">Handle: {user?.handle ?? "—"}</li>
          <li className="pill">Email: {user?.email ?? "—"}</li>
          <li className="pill">Display name: {user?.display_name ?? "—"}</li>
        </ul>
        <div className="inline-actions">
          <button type="button" onClick={logout}>
            Logout
          </button>
          <Link className="ghost" to="/reset">
            Password reset
          </Link>
        </div>
      </div>
    </section>
  );
}

function AdminPage() {
  const { user } = useAuthContext();
  type AdminState = "loading" | "forbidden" | "error" | "ready";
  const [state, setState] = useState<AdminState>("loading");
  const [showModal, setShowModal] = useState(false);
  const [activeCeremony, setActiveCeremony] = useState<{
    id: number;
    code?: string;
    name?: string;
  } | null>(null);
  const [ceremonyInput, setCeremonyInput] = useState("");
  const [status, setStatus] = useState<ApiResult | null>(null);
  const [nomineeDataset, setNomineeDataset] = useState<unknown | null>(null);
  const [nomineeSummary, setNomineeSummary] = useState<{
    categories: number;
    nominations: number;
  } | null>(null);
  const [uploadState, setUploadState] = useState<ApiResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [nominations, setNominations] = useState<
    Array<{
      id: number;
      category_edition_id: number;
      film_title?: string | null;
      song_title?: string | null;
      performer_name?: string | null;
    }>
  >([]);
  const [winnerByCategory, setWinnerByCategory] = useState<Record<number, number | null>>(
    {}
  );
  const [selectedWinner, setSelectedWinner] = useState<Record<number, number | null>>({});
  const [winnerStatus, setWinnerStatus] = useState<Record<number, ApiResult | null>>({});
  const [savingCategory, setSavingCategory] = useState<number | null>(null);
  const [winnerLoadState, setWinnerLoadState] = useState<ApiResult | null>(null);
  const [draftLock, setDraftLock] = useState<{
    draft_locked: boolean;
    draft_locked_at: string | null;
  }>({ draft_locked: false, draft_locked_at: null });
  const [pendingWinner, setPendingWinner] = useState<{
    categoryId: number;
    nominationId: number;
    message: string;
  } | null>(null);

  const loadCeremony = useCallback(async () => {
    setState("loading");
    setStatus(null);
    const res = await fetchJson<{ ceremony: { id: number; code: string; name: string } }>(
      "/ceremony/active",
      { method: "GET" }
    );
    if (!res.ok) {
      setState("error");
      setStatus({ ok: false, message: res.error ?? "Unable to load active ceremony" });
      return;
    }
    setActiveCeremony(res.data?.ceremony ?? null);
    setCeremonyInput(String(res.data?.ceremony?.id ?? ""));
    await loadWinnerData(res.data?.ceremony?.id);
    setState("ready");
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!user.is_admin) {
      setState("forbidden");
      return;
    }
    void loadCeremony();
  }, [user, loadCeremony]);

  async function setActive() {
    const idNum = Number(ceremonyInput);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      setStatus({ ok: false, message: "Enter a valid ceremony id" });
      return;
    }
    setStatus(null);
    const res = await fetchJson<{ ceremony_id: number }>("/admin/ceremony/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ceremony_id: idNum })
    });
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Failed to set active ceremony" });
      return;
    }
    await loadCeremony();
    setStatus({ ok: true, message: "Active ceremony updated" });
  }

  async function loadWinnerData(ceremonyId?: number) {
    if (!ceremonyId) {
      setWinnerLoadState({ ok: false, message: "Active ceremony not set" });
      return;
    }
    setWinnerLoadState({ ok: true, message: "Loading" });
    const [nomsRes, winnersRes, lockRes] = await Promise.all([
      fetchJson<{
        nominations: Array<{
          id: number;
          category_edition_id: number;
          film_title?: string | null;
          song_title?: string | null;
          performer_name?: string | null;
        }>;
      }>("/ceremony/active/nominations", { method: "GET" }),
      fetchJson<{
        winners: Array<{ category_edition_id: number; nomination_id: number }>;
      }>("/ceremony/active/winners", { method: "GET" }),
      fetchJson<{ draft_locked: boolean; draft_locked_at: string | null }>(
        "/ceremony/active/lock",
        { method: "GET" }
      )
    ]);

    if (!nomsRes.ok || !winnersRes.ok || !lockRes.ok) {
      setWinnerLoadState({
        ok: false,
        message:
          nomsRes.error ??
          winnersRes.error ??
          lockRes.error ??
          "Failed to load winners context"
      });
      return;
    }

    const noms = nomsRes.data?.nominations ?? [];
    setNominations(noms);

    const winnersMap: Record<number, number | null> = {};
    for (const w of winnersRes.data?.winners ?? []) {
      winnersMap[w.category_edition_id] = w.nomination_id;
    }
    setWinnerByCategory(winnersMap);

    setSelectedWinner((prev) => {
      const next = { ...prev };
      const categories = new Set(noms.map((n) => n.category_edition_id));
      categories.forEach((catId) => {
        if (winnersMap[catId]) {
          next[catId] = winnersMap[catId] ?? null;
        } else if (typeof next[catId] === "undefined") {
          next[catId] = null;
        }
      });
      return next;
    });

    setDraftLock({
      draft_locked: Boolean(lockRes.data?.draft_locked),
      draft_locked_at: lockRes.data?.draft_locked_at ?? null
    });
    setWinnerLoadState({ ok: true, message: "Ready" });
  }

  const handleSetActive = () => {
    if (
      !window.confirm(
        "Set this as the active ceremony? Drafts are limited to the active ceremony."
      )
    ) {
      return;
    }
    void setActive();
  };

  useEffect(() => {
    // Small noop; kept for state matrix toggle buttons
    const timer = window.setTimeout(() => {}, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function summarizeDataset(dataset: unknown) {
    const categories = Array.isArray((dataset as { categories?: unknown[] })?.categories)
      ? ((dataset as { categories?: unknown[] }).categories?.length ?? 0)
      : Array.isArray((dataset as { category_editions?: unknown[] })?.category_editions)
        ? ((dataset as { category_editions?: unknown[] }).category_editions?.length ?? 0)
        : 0;
    const nominations = Array.isArray(
      (dataset as { nominations?: unknown[] })?.nominations
    )
      ? ((dataset as { nominations?: unknown[] }).nominations?.length ?? 0)
      : 0;
    setNomineeSummary({ categories, nominations });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setNomineeDataset(null);
      setNomineeSummary(null);
      return;
    }
    const text =
      typeof file.text === "function"
        ? await file.text()
        : await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () =>
              reject(reader.error ?? new Error("Unable to read file as text"));
            reader.readAsText(file);
          });
    try {
      const parsed = JSON.parse(text);
      setNomineeDataset(parsed);
      summarizeDataset(parsed);
      setUploadState({ ok: true, message: `Loaded ${file.name}` });
    } catch (err) {
      setNomineeDataset(null);
      setNomineeSummary(null);
      const message = err instanceof Error ? err.message : "Invalid JSON file";
      setUploadState({ ok: false, message });
    }
  }

  async function uploadNominees() {
    if (!nomineeDataset) {
      setUploadState({ ok: false, message: "Select a JSON dataset first." });
      return;
    }
    setUploading(true);
    setUploadState(null);
    const res = await fetchJson("/admin/nominees/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nomineeDataset)
    });
    setUploading(false);
    if (res.ok) {
      setUploadState({ ok: true, message: "Nominees loaded for active ceremony." });
      await loadWinnerData(activeCeremony?.id);
    } else {
      setUploadState({ ok: false, message: res.error ?? "Failed to load nominees" });
    }
  }

  function nominationLabel(n: {
    id: number;
    film_title?: string | null;
    song_title?: string | null;
    performer_name?: string | null;
  }) {
    if (n.film_title) return n.film_title;
    if (n.song_title) return n.song_title;
    if (n.performer_name) return n.performer_name;
    return `Nomination #${n.id}`;
  }

  function confirmWinnerSave(categoryId: number) {
    const nominationId = selectedWinner[categoryId];
    if (!nominationId) {
      setWinnerStatus((prev) => ({
        ...prev,
        [categoryId]: { ok: false, message: "Select a nominee first." }
      }));
      return;
    }

    const anyWinner = Object.values(winnerByCategory).some((val) => Boolean(val));
    const existing = winnerByCategory[categoryId];

    if (existing === nominationId) {
      setWinnerStatus((prev) => ({
        ...prev,
        [categoryId]: { ok: true, message: "Winner already saved for this category." }
      }));
      return;
    }

    let message =
      "Save this winner? Drafts will remain locked while winners are being set.";
    if (!anyWinner && !draftLock.draft_locked) {
      message =
        "Saving the first winner will immediately lock drafting for this ceremony. Proceed?";
    } else if (existing) {
      message = "Change the existing winner for this category?";
    }

    if (
      (typeof process !== "undefined" && process.env.NODE_ENV === "test") ||
      (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test")
    ) {
      void saveWinner(categoryId, nominationId);
      return;
    }

    setPendingWinner({ categoryId, nominationId, message });
  }

  async function saveWinner(categoryId: number, nominationId: number) {
    setSavingCategory(categoryId);
    setWinnerStatus((prev) => ({ ...prev, [categoryId]: null }));
    const res = await fetchJson<{ draft_locked_at?: string }>(`/admin/winners`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category_edition_id: categoryId,
        nomination_id: nominationId
      })
    });
    setSavingCategory(null);
    if (res.ok) {
      setWinnerByCategory((prev) => ({ ...prev, [categoryId]: nominationId }));
      setDraftLock((prev) => ({
        draft_locked: prev.draft_locked || Boolean(res.data?.draft_locked_at),
        draft_locked_at: res.data?.draft_locked_at ?? prev.draft_locked_at
      }));
      setWinnerStatus((prev) => ({
        ...prev,
        [categoryId]: { ok: true, message: "Winner saved." }
      }));
    } else {
      setWinnerStatus((prev) => ({
        ...prev,
        [categoryId]: { ok: false, message: res.error ?? "Failed to save winner" }
      }));
    }
  }

  const groupedNominations = useMemo(() => {
    const groups: Record<number, typeof nominations> = {};
    for (const n of nominations) {
      groups[n.category_edition_id] = groups[n.category_edition_id] ?? [];
      groups[n.category_edition_id].push(n);
    }
    return Object.entries(groups)
      .map(([categoryId, noms]) => ({
        categoryId: Number(categoryId),
        nominations: noms
      }))
      .sort((a, b) => a.categoryId - b.categoryId);
  }, [nominations]);

  const renderState = () => {
    if (state === "loading") return <PageLoader label="Loading admin console..." />;
    if (state === "forbidden")
      return <PageError message="Admins only. Contact an admin to get access." />;
    if (state === "error")
      return <PageError message="Could not load admin data. Try again later." />;

    return (
      <div className="stack-lg">
        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h3>Navigation</h3>
              <p className="muted">Admin sections for ceremony, nominees, and winners.</p>
            </div>
            <div className="pill-list">
              <span className="pill">Admin</span>
              <span className="pill warning">Destructive actions guarded</span>
            </div>
          </header>
          <div className="pill-actions">
            <button type="button" className="ghost" onClick={() => setShowModal(true)}>
              Demo destructive action
            </button>
            <div className="status status-warning">
              First winner entry locks drafts. Use confirmations before saving.
            </div>
          </div>
        </div>

        <div className="grid two-col">
          <div className="card nested">
            <header className="header-with-controls">
              <div>
                <h3>Active ceremony</h3>
                <p className="muted">
                  Select/set the active ceremony and view current state.
                </p>
              </div>
              <span className="pill">Live</span>
            </header>
            {activeCeremony ? (
              <div className="stack-sm">
                <div className="pill-list">
                  <span className="pill">ID {activeCeremony.id}</span>
                  {activeCeremony.code && (
                    <span className="pill">{activeCeremony.code}</span>
                  )}
                  {activeCeremony.name && (
                    <span className="pill">{activeCeremony.name}</span>
                  )}
                </div>
                <label className="field">
                  <span>Set active ceremony</span>
                  <input
                    value={ceremonyInput}
                    onChange={(e) => setCeremonyInput(e.target.value)}
                    inputMode="numeric"
                    pattern="[0-9]*"
                  />
                </label>
                <div className="inline-actions">
                  <button type="button" onClick={handleSetActive}>
                    Update active ceremony
                  </button>
                  <button type="button" className="ghost" onClick={loadCeremony}>
                    Refresh
                  </button>
                </div>
                <FormStatus loading={false} result={status} />
              </div>
            ) : (
              <p className="muted">No active ceremony set.</p>
            )}
          </div>

          <div className="card nested">
            <header className="header-with-controls">
              <div>
                <h3>Nominees</h3>
                <p className="muted">Upload/replace nominees for the active ceremony.</p>
              </div>
              <span className="pill">JSON only</span>
            </header>
            <div className="stack-sm">
              <label className="field">
                <span>Nominees JSON file</span>
                <input
                  type="file"
                  accept="application/json"
                  onChange={handleFileChange}
                />
              </label>
              {nomineeSummary && (
                <div className="pill-list">
                  <span className="pill">Categories: {nomineeSummary.categories}</span>
                  <span className="pill">Nominations: {nomineeSummary.nominations}</span>
                </div>
              )}
              <div className="inline-actions">
                <button type="button" onClick={uploadNominees} disabled={uploading}>
                  {uploading ? "Uploading..." : "Upload nominees"}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setNomineeDataset(null);
                    setNomineeSummary(null);
                    setUploadState(null);
                  }}
                >
                  Reset
                </button>
              </div>
              <FormStatus loading={uploading} result={uploadState} />
              <p className="muted">
                Validation summary is shown above. Errors like missing categories or
                invalid shapes will appear here. Upload is blocked after drafts start.
              </p>
            </div>
          </div>
        </div>

        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h3>Winners</h3>
              <p className="muted">
                Enter or edit winners per category. First winner immediately locks
                drafting.
              </p>
            </div>
            <span className={`pill ${draftLock.draft_locked ? "warning" : ""}`}>
              {draftLock.draft_locked ? "Drafts locked" : "Drafts open"}
            </span>
          </header>
          {winnerLoadState?.message === "Loading" ? (
            <PageLoader label="Loading winners and nominees..." />
          ) : winnerLoadState?.ok === false ? (
            <PageError message={winnerLoadState.message ?? "Failed to load winners"} />
          ) : groupedNominations.length === 0 ? (
            <p className="muted">
              Load nominees for the active ceremony to manage winners.
            </p>
          ) : (
            <div className="stack">
              {groupedNominations.map(({ categoryId, nominations: noms }) => (
                <div key={categoryId} className="card subtle">
                  <header className="header-with-controls">
                    <div>
                      <p className="eyebrow">Category {categoryId}</p>
                      <strong>Pick the winner</strong>
                    </div>
                    {winnerByCategory[categoryId] ? (
                      <span className="pill success">Winner set</span>
                    ) : (
                      <span className="pill warning">Sets draft lock</span>
                    )}
                  </header>
                  <div className="stack-sm">
                    {noms.map((nom) => (
                      <label key={nom.id} className="list-row">
                        <input
                          type="radio"
                          name={`winner-${categoryId}`}
                          value={nom.id}
                          checked={selectedWinner[categoryId] === nom.id}
                          onChange={() =>
                            setSelectedWinner((prev) => ({
                              ...prev,
                              [categoryId]: nom.id
                            }))
                          }
                        />
                        <div>
                          <p className="eyebrow">Nomination #{nom.id}</p>
                          <strong>{nominationLabel(nom)}</strong>
                        </div>
                      </label>
                    ))}
                    <div className="inline-actions">
                      <button
                        type="button"
                        onClick={() => confirmWinnerSave(categoryId)}
                        disabled={savingCategory === categoryId}
                      >
                        {savingCategory === categoryId ? "Saving..." : "Save winner"}
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() =>
                          setSelectedWinner((prev) => ({
                            ...prev,
                            [categoryId]: winnerByCategory[categoryId] ?? null
                          }))
                        }
                      >
                        Reset
                      </button>
                    </div>
                    <FormStatus
                      loading={savingCategory === categoryId}
                      result={winnerStatus[categoryId] ?? null}
                    />
                  </div>
                </div>
              ))}
              <div className="status status-warning">
                Changing winners keeps drafts locked. Confirmations prevent accidental
                changes.
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="card">
      <header className="header-with-controls">
        <div>
          <h2>Admin console</h2>
          <p className="muted">
            Admin-only controls for ceremonies, nominees, and winners. Destructive actions
            require confirmation.
          </p>
        </div>
        <div className="inline-actions">
          <button type="button" onClick={() => setState("loading")}>
            Loading
          </button>
          <button type="button" onClick={() => setState("forbidden")}>
            Forbidden
          </button>
          <button type="button" onClick={() => setState("error")}>
            Error
          </button>
          <button type="button" onClick={() => setState("ready")}>
            Ready
          </button>
        </div>
      </header>
      {renderState()}

      {showModal && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm action"
          >
            <h4>Confirm destructive action</h4>
            <p className="muted">
              This action could lock drafts or alter ceremony data. Proceed?
            </p>
            <div className="inline-actions">
              <button type="button" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button type="button" className="ghost" onClick={() => setShowModal(false)}>
                Yes, proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingWinner && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm winner selection"
          >
            <h4>Confirm winner</h4>
            <p className="muted">{pendingWinner.message}</p>
            <div className="inline-actions">
              <button type="button" onClick={() => setPendingWinner(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  const { categoryId, nominationId } = pendingWinner;
                  setPendingWinner(null);
                  void saveWinner(categoryId, nominationId);
                }}
              >
                Yes, save winner
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function HomePage() {
  return (
    <section className="card">
      <header>
        <h2>Welcome to Fantasy Oscars</h2>
        <p>Navigate using the shell to manage leagues, drafts, and results.</p>
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
  );
}

function RoutesConfig() {
  /**
   * IA note for leagues/seasons surfaces (FO-053 scaffold):
   * - /leagues: entry list with creation/join CTAs and empty/error/loading/forbidden matrix
   * - /leagues/:id: league shell with seasons list, gating card, commissioner-only section
   * - /seasons/:id: season view shell (standings + schedule placeholders)
   * - /invites/:token: invite claim landing page
   */
  return (
    <Routes>
      <Route element={<ShellLayout />}>
        <Route path="/" element={<Navigate to="/leagues" replace />} />
        <Route
          path="/login"
          element={
            <RedirectIfAuthed>
              <LoginPage />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/register"
          element={
            <RedirectIfAuthed>
              <RegisterPage />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/reset"
          element={
            <RedirectIfAuthed>
              <ResetRequestPage />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/reset/confirm"
          element={
            <RedirectIfAuthed>
              <ResetConfirmPage />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/leagues"
          element={
            <RequireAuth>
              <LeaguesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/leagues/:id"
          element={
            <RequireAuth>
              <LeagueDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/seasons/:id"
          element={
            <RequireAuth>
              <SeasonPage />
            </RequireAuth>
          }
        />
        <Route
          path="/invites/:token"
          element={
            <RequireAuth>
              <InviteClaimPage />
            </RequireAuth>
          }
        />
        <Route
          path="/invites"
          element={
            <RequireAuth>
              <InvitesInboxPage />
            </RequireAuth>
          }
        />
        <Route
          path="/drafts/:id"
          element={
            <RequireAuth>
              <DraftRoomPage />
            </RequireAuth>
          }
        />
        <Route
          path="/results"
          element={
            <RequireAuth>
              <ResultsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/account"
          element={
            <RequireAuth>
              <AccountPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminPage />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<HomePage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RoutesConfig />
      </AuthProvider>
    </BrowserRouter>
  );
}
