type Level = "info" | "error";

export type DraftContext = {
  draft_id?: string | number;
  user_id?: string | number;
};

export type LogEntry = {
  level: Level;
  msg: string;
  [key: string]: unknown;
};

type LogLevelSetting = "silent" | "error" | "info";

function isTestRuntime(): boolean {
  // Vitest sets NODE_ENV="test" in many setups, but don't rely on it.
  return (
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true" ||
    typeof process.env.VITEST_WORKER_ID === "string"
  );
}

function getConfiguredLevel(): LogLevelSetting {
  const raw = String(process.env.LOG_LEVEL || "").toLowerCase();
  if (raw === "silent" || raw === "error" || raw === "info") return raw;
  if (isTestRuntime()) return "silent";
  return "info";
}

function shouldLog(entryLevel: Level): boolean {
  const configured = getConfiguredLevel();
  if (configured === "silent") return false;
  if (configured === "error") return entryLevel === "error";
  return true;
}

function wantsPrettyOutput(): boolean {
  const raw = String(process.env.LOG_FORMAT || "").toLowerCase();
  if (raw === "json") return false;
  if (raw === "pretty") return true;
  // Default: in tests, keep output readable; elsewhere keep structured JSON.
  return isTestRuntime();
}

function formatKeyValue(key: string, value: unknown): string {
  if (value === undefined) return "";
  if (value === null) return `${key}=null`;
  if (typeof value === "string") return `${key}="${value}"`;
  if (typeof value === "number" || typeof value === "boolean") return `${key}=${value}`;
  try {
    return `${key}=${JSON.stringify(value)}`;
  } catch {
    return `${key}=[unserializable]`;
  }
}

function toPrettyLine(entry: LogEntry): string {
  const { level, msg, ...rest } = entry;

  if (msg === "request") {
    const method = rest.method ? String(rest.method) : "?";
    const p = rest.path ? String(rest.path) : "?";
    const status = rest.status ? String(rest.status) : "?";
    const duration =
      typeof rest.duration_ms === "number" ? `${rest.duration_ms}ms` : "?ms";

    const extras: string[] = [];
    for (const key of ["draft_id", "user_id"]) {
      if (rest[key] !== undefined) extras.push(formatKeyValue(key, rest[key]));
    }
    return `${level.toUpperCase()} ${method} ${p} -> ${status} (${duration})${extras.length ? ` ${extras.join(" ")}` : ""}`;
  }

  if (msg === "request_error") {
    const method = rest.method ? String(rest.method) : "?";
    const p = rest.path ? String(rest.path) : "?";
    const status = rest.status ? String(rest.status) : "?";
    const code = rest.code ? String(rest.code) : "UNKNOWN";
    const error = rest.error ? String(rest.error) : "Unknown error";
    return `${level.toUpperCase()} ${method} ${p} -> ${status} code=${code} error="${error}"`;
  }

  const extras = Object.keys(rest)
    .sort()
    .map((k) => formatKeyValue(k, rest[k]))
    .filter(Boolean)
    .join(" ");
  return `${level.toUpperCase()} ${msg}${extras ? ` ${extras}` : ""}`;
}

export function log(entry: LogEntry) {
  if (!shouldLog(entry.level)) return;
  // Structured console logging for now; replace with real logger later.
  console.log(wantsPrettyOutput() ? toPrettyLine(entry) : JSON.stringify(entry));
}

function pickFirst(
  obj: Record<string, unknown>,
  keys: string[]
): string | number | undefined {
  for (const key of keys) {
    if (obj[key] === 0 || obj[key]) return obj[key] as string | number;
  }
  return undefined;
}

export function deriveDraftContext(body: unknown): DraftContext {
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  return {
    draft_id: pickFirst(record, ["draft_id", "draftId"]),
    user_id: pickFirst(record, ["user_id", "userId"])
  };
}

export function buildRequestLog(input: {
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  request_id?: string;
  body?: unknown;
}): LogEntry {
  const context = deriveDraftContext(input.body);
  return {
    level: "info",
    msg: "request",
    method: input.method,
    path: input.path,
    status: input.status,
    duration_ms: input.duration_ms,
    request_id: input.request_id,
    ...context
  };
}
