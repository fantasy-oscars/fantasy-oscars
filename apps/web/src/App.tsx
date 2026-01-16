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
): Promise<{ ok: boolean; data?: T; error?: string; errorCode?: string }> {
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
      return { ok: false, error: msg, errorCode: code };
    }
    return { ok: true, data: json as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    return { ok: false, error: message };
  }
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

type AuthUser = { sub: string; handle?: string; email?: string; display_name?: string };
type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  login: (input: { handle: string; password: string }) => Promise<boolean>;
  register: (input: {
    handle: string;
    email: string;
    display_name: string;
    password: string;
  }) => Promise<boolean>;
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
      return true;
    }
    setError(res.error ?? "Login failed");
    setUser(null);
    return false;
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
        return true;
      }
      setError(res.error ?? "Registration failed");
      return false;
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
    const ok = await login({
      handle: String(data.get("handle")),
      password: String(data.get("password"))
    });
    setLoading(false);
    setResult({ ok, message: ok ? "Logged in" : "Login failed" });
    if (ok) navigate(from, { replace: true });
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
    const ok = await register({
      handle: String(data.get("handle")),
      email: String(data.get("email")),
      display_name: String(data.get("display_name")),
      password: String(data.get("password"))
    });
    setLoading(false);
    setResult({ ok, message: ok ? "Registered" : "Registration failed" });
    if (ok) navigate("/leagues", { replace: true });
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
  return (
    <div className="card">
      <header>
        <h2>Leagues</h2>
        <p>Browse or manage your leagues.</p>
      </header>
      <p className="muted">Leagues list will appear here in MVP.</p>
    </div>
  );
}

function LeagueDetailPage() {
  const { id } = useParams();
  return (
    <div className="card">
      <header>
        <h2>League #{id}</h2>
        <p>Roster, invites, and draft access.</p>
      </header>
      <p className="muted">League detail placeholder.</p>
    </div>
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
  };
  seats: Array<{ seat_number: number; league_member_id: number; user_id?: number }>;
  picks: Array<{ pick_number: number; seat_number: number; nomination_id: number }>;
  version: number;
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

function DraftRoom(props: { initialDraftId?: string | number; disabled?: boolean }) {
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

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    lastVersionRef.current = lastVersion;
  }, [lastVersion]);

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
  const params = useParams();
  return <DraftRoom initialDraftId={params.id} />;
}

function ResultsPage() {
  return (
    <section className="card">
      <header>
        <h2>Results</h2>
        <p>Standings and winners for the active ceremony.</p>
      </header>
      <p className="muted">Results view placeholder.</p>
    </section>
  );
}

function AccountPage() {
  const { user } = useAuthContext();
  return (
    <section className="card">
      <header>
        <h2>Account</h2>
        <p>Manage your profile and security.</p>
      </header>
      <p className="muted">Signed in as {user?.handle ?? user?.sub ?? "unknown"}.</p>
    </section>
  );
}

function AdminPage() {
  return (
    <section className="card">
      <header>
        <h2>Admin</h2>
        <p>Admin-only controls for ceremonies and winners.</p>
      </header>
      <p className="muted">Admin console placeholder.</p>
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
            <RequireAuth>
              <AdminPage />
            </RequireAuth>
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
