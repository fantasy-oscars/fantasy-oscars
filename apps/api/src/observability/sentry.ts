import * as Sentry from "@sentry/node";
import type { ErrorEvent } from "@sentry/node";

/** Remove request bodies, cookies and credentials before an event leaves the process. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.headers) {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(event.request.headers)) {
        const lower = key.toLowerCase();
        if (lower === "authorization" || lower === "cookie" || lower === "set-cookie") {
          continue;
        }
        headers[key] = value;
      }
      event.request.headers = headers;
    }
  }
  return event;
}

let enabled = false;

/** Initialise Sentry only when SENTRY_DSN is set. Returns whether it was initialised. */
export function initSentry(env: NodeJS.ProcessEnv = process.env): boolean {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: env.SENTRY_ENVIRONMENT?.trim() || env.NODE_ENV,
    // @sentry/node v11 replaced `sendDefaultPii` with `dataCollection`; this is its strictest form.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false
    },
    beforeSend: scrubEvent,
    // Keep Node's default behaviour of exiting on an unhandled rejection, after capturing it.
    integrations: [Sentry.onUnhandledRejectionIntegration({ mode: "strict" })]
  });
  enabled = true;
  return true;
}

/** Report a 5xx error. No-op when Sentry is not initialised. */
export function captureServerError(err: unknown, requestId?: string): void {
  if (!enabled) return;
  Sentry.captureException(err, requestId ? { tags: { request_id: requestId } } : {});
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!enabled) return;
  await Sentry.flush(timeoutMs);
}
