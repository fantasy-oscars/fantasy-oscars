type ApiError = { code?: string; message?: string };

type Env = { VITE_API_BASE?: string };

const API_BASE = (
  (import.meta as unknown as { env: Env }).env.VITE_API_BASE ?? ""
).trim();

import { getContentRevision } from "./revision";

function buildUrl(path: string, init?: RequestInit) {
  const method = String(init?.method ?? "GET").toUpperCase();
  const isGet = method === "GET";
  const isPublicContent = path.startsWith("/content/");

  if (!isGet || !isPublicContent) return `${API_BASE}${path}`;

  const rev = getContentRevision();
  const sep = path.includes("?") ? "&" : "?";
  // Query param is intentionally generic; used only for cache-busting.
  return `${API_BASE}${path}${sep}rev=${encodeURIComponent(String(rev))}`;
}

function friendlyApiErrorMessage(input: {
  status: number;
  code?: string;
  message?: string;
}): string {
  const { status, code, message } = input;

  // Prefer consistent, friendly, user-actionable messages.
  switch (code) {
    case "INVALID_CREDENTIALS":
      return "Incorrect username or password.";
    case "USER_EXISTS":
      return "That username or email is already in use.";
    case "VALIDATION_ERROR":
      return "Please check the highlighted fields and try again.";
    case "UNAUTHORIZED":
    case "INVALID_TOKEN":
    case "TOKEN_EXPIRED":
      return "Your session has expired. Please log in again.";
    case "FORBIDDEN":
      return "You do not have permission to do that.";
    case "NOT_FOUND":
      return "That resource was not found.";
    case "INTERNAL_ERROR":
      return "Something went wrong on our side. Please try again.";
    default:
      break;
  }

  if (status >= 500) return "Something went wrong on our side. Please try again.";
  if (message && message !== "Unexpected error") return message;
  return status ? `Request failed (HTTP ${status}).` : "Request failed.";
}

export async function fetchJson<T>(
  path: string,
  init?: RequestInit
): Promise<{
  ok: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  errorFields?: string[];
  requestId?: string;
}> {
  try {
    const res = await fetch(buildUrl(path, init), {
      credentials: "include",
      ...init
    });
    // In unit tests, fetch may be mocked with a minimal Response-like object.
    const requestIdHeader =
      typeof (res as { headers?: { get?: unknown } }).headers?.get === "function"
        ? ((res as { headers: { get: (name: string) => string | null } }).headers.get(
            "x-request-id"
          ) ?? undefined)
        : undefined;
    let jsonParsed = false;
    const json = (await (typeof (res as { json?: unknown }).json === "function"
      ? (res as { json: () => Promise<unknown> })
          .json()
          .then((v) => {
            jsonParsed = true;
            return v;
          })
          .catch(() => ({}))
      : Promise.resolve({}))) as { error?: ApiError & { request_id?: string } } & Record<
      string,
      unknown
    >;
    const requestId =
      requestIdHeader ??
      ((json.error as { request_id?: unknown } | undefined)?.request_id &&
      typeof (json.error as { request_id?: unknown }).request_id === "string"
        ? (json.error as { request_id: string }).request_id
        : undefined);

    // Best-effort: if JSON parsing didn't work, try to read text for debugging.
    const textBody =
      !jsonParsed && !res.ok && typeof (res as { text?: unknown }).text === "function"
        ? await (res as { text: () => Promise<string> }).text().catch(() => "")
        : "";
    if (!res.ok) {
      const err = json.error ?? {};
      const code = err.code;
      const msg = friendlyApiErrorMessage({
        status: res.status,
        code,
        message:
          err.message ??
          (textBody ? `Request failed: ${textBody.slice(0, 160)}` : undefined)
      });
      const fields =
        Array.isArray((err as { details?: { fields?: unknown } })?.details?.fields) &&
        (err as { details: { fields?: unknown[] } }).details.fields?.every(
          (f) => typeof f === "string"
        )
          ? ((err as { details: { fields: string[] } }).details.fields as string[])
          : undefined;
      return { ok: false, error: msg, errorCode: code, errorFields: fields, requestId };
    }
    return { ok: true, data: json as T, requestId };
  } catch (err) {
    // Never leak low-level runtime errors to users. Convert to actionable messages.
    const raw = err instanceof Error ? err.message : "Request failed";
    const normalized = typeof raw === "string" ? raw.toLowerCase() : "";

    if (normalized.includes("failed to fetch")) {
      return {
        ok: false,
        error: "We couldn't reach the server. Please try again in a moment."
      };
    }

    if (
      normalized.includes("headers.get") ||
      normalized.includes("instances of headers") ||
      normalized.includes("illegal invocation")
    ) {
      return {
        ok: false,
        error:
          "Something went wrong while starting your session. Please refresh and try again."
      };
    }

    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
