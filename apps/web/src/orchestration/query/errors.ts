import type { fetchJson } from "../../lib/api";
import type { FieldFailure } from "../../decisions/fieldErrors";

type FetchResult<T> = Awaited<ReturnType<typeof fetchJson<T>>>;

/** Failure of a `fetchJson` call, carried through TanStack Query as an Error. */
export class ApiQueryError extends Error {
  readonly status?: number;
  readonly errorCode?: string;
  readonly requestId?: string;
  readonly fields?: string[];

  constructor(
    message: string,
    meta: {
      status?: number;
      errorCode?: string;
      requestId?: string;
      fields?: string[];
    } = {}
  ) {
    super(message);
    this.name = "ApiQueryError";
    this.status = meta.status;
    this.errorCode = meta.errorCode;
    this.requestId = meta.requestId;
    this.fields = meta.fields;
  }
}

/** Unwraps a `fetchJson` result for use as a query/mutation function. */
export function unwrap<T>(res: FetchResult<T>, fallbackMessage: string): T | undefined {
  if (!res.ok) {
    throw new ApiQueryError(res.error ?? fallbackMessage, {
      status: res.status,
      errorCode: res.errorCode,
      requestId: res.requestId,
      fields: res.errorFields
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

/** The parts of a failed call that `useFieldErrors` can place on inputs. */
export function errorFailure(err: unknown): FieldFailure {
  return {
    error: err instanceof Error ? err.message : undefined,
    errorCode: errorCode(err),
    errorFields: err instanceof ApiQueryError ? err.fields : undefined
  };
}
