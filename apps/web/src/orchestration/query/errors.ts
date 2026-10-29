import type { fetchJson } from "../../lib/api";

type FetchResult<T> = Awaited<ReturnType<typeof fetchJson<T>>>;

/** Failure of a `fetchJson` call, carried through TanStack Query as an Error. */
export class ApiQueryError extends Error {
  readonly status?: number;
  readonly errorCode?: string;
  readonly requestId?: string;

  constructor(
    message: string,
    meta: { status?: number; errorCode?: string; requestId?: string } = {}
  ) {
    super(message);
    this.name = "ApiQueryError";
    this.status = meta.status;
    this.errorCode = meta.errorCode;
    this.requestId = meta.requestId;
  }
}

/** Unwraps a `fetchJson` result for use as a query/mutation function. */
export function unwrap<T>(res: FetchResult<T>, fallbackMessage: string): T | undefined {
  if (!res.ok) {
    throw new ApiQueryError(res.error ?? fallbackMessage, {
      status: res.status,
      errorCode: res.errorCode,
      requestId: res.requestId
    });
  }
  return res.data;
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function errorRequestId(err: unknown): string | undefined {
  return err instanceof ApiQueryError ? err.requestId : undefined;
}

export function errorCode(err: unknown): string | undefined {
  return err instanceof ApiQueryError ? err.errorCode : undefined;
}
