import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn()
}));
vi.mock("@sentry/node", () => ({
  init: mocks.init,
  captureException: mocks.captureException,
  flush: vi.fn(),
  onUnhandledRejectionIntegration: vi.fn(() => ({ name: "OnUnhandledRejection" }))
}));

import {
  initSentry,
  scrubEvent,
  captureServerError
} from "../../../src/observability/sentry.js";

beforeEach(() => {
  mocks.init.mockClear();
  mocks.captureException.mockClear();
});

describe("initSentry", () => {
  it("is a no-op without SENTRY_DSN", () => {
    expect(initSentry({} as NodeJS.ProcessEnv)).toBe(false);
    expect(initSentry({ SENTRY_DSN: "  " } as NodeJS.ProcessEnv)).toBe(false);
    expect(mocks.init).not.toHaveBeenCalled();
    captureServerError(new Error("x"));
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("initialises without PII and with scrubbing when a DSN is set", () => {
    const ok = initSentry({
      SENTRY_DSN: "https://key@example.ingest.sentry.io/1",
      SENTRY_ENVIRONMENT: "staging"
    } as NodeJS.ProcessEnv);
    expect(ok).toBe(true);
    const opts = mocks.init.mock.calls[0]![0];
    expect(opts.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false
    });
    expect(opts.environment).toBe("staging");
    expect(opts.beforeSend).toBe(scrubEvent);
    captureServerError(new Error("x"), "req-1");
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });
});

describe("scrubEvent", () => {
  it("strips request body, cookies, and credential headers", () => {
    const event = scrubEvent({
      type: undefined,
      request: {
        url: "https://api.example.com/auth/login",
        method: "POST",
        data: { password: "hunter2" },
        cookies: { session: "abc" },
        query_string: "token=abc",
        headers: {
          Authorization: "Bearer secret",
          Cookie: "session=abc",
          "content-type": "application/json"
        }
      }
    });
    expect(event.request?.data).toBeUndefined();
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.query_string).toBeUndefined();
    expect(event.request?.headers).toEqual({ "content-type": "application/json" });
    expect(event.request?.url).toBe("https://api.example.com/auth/login");
  });

  it("passes events without a request through", () => {
    expect(scrubEvent({ type: undefined })).toEqual({ type: undefined });
  });
});
