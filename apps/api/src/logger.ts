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

export function log(entry: LogEntry) {
  // Structured console logging for now; replace with real logger later.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
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
    ...context
  };
}
