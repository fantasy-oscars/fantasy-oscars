type ApiError = { code?: string; message?: string };

type Env = { VITE_API_BASE?: string };

const API_BASE = (
  (import.meta as unknown as { env: Env }).env.VITE_API_BASE ?? ""
).trim();

function buildUrl(path: string) {
  return `${API_BASE}${path}`;
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
    const res = await fetch(buildUrl(path), {
      credentials: "include",
      ...init
    });
    const requestIdHeader = res.headers.get("x-request-id") ?? undefined;
    const contentType = res.headers.get("content-type") ?? "";

    const json = (await (contentType.includes("application/json")
      ? res.json().catch(() => ({}))
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

    const textBody =
      !contentType.includes("application/json") && !res.ok
        ? await res.text().catch(() => "")
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
    const raw = err instanceof Error ? err.message : "Request failed";
    const message =
      typeof raw === "string" && raw.toLowerCase().includes("failed to fetch")
        ? "Network error: API unreachable (it may be starting up). Please try again."
        : raw;
    return { ok: false, error: message };
  }
}
