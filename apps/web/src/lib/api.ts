type ApiError = { code?: string; message?: string };

type Env = { VITE_API_BASE?: string };

const API_BASE = (
  (import.meta as unknown as { env: Env }).env.VITE_API_BASE ?? ""
).trim();

function buildUrl(path: string) {
  return `${API_BASE}${path}`;
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
        (err as { details: { fields?: unknown[] } }).details.fields?.every(
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

