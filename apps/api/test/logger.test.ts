import { describe, expect, it } from "vitest";
import { buildRequestLog, deriveDraftContext } from "../src/logger.js";

describe("deriveDraftContext", () => {
  it("picks draft_id and user_id when present", () => {
    expect(deriveDraftContext({ draft_id: 1, userId: "u1" })).toEqual({
      draft_id: 1,
      user_id: "u1"
    });
  });

  it("returns empty when fields missing", () => {
    expect(deriveDraftContext({})).toEqual({});
    expect(deriveDraftContext(null)).toEqual({});
  });
});

describe("buildRequestLog", () => {
  it("includes method/path/status/duration", () => {
    const entry = buildRequestLog({
      method: "POST",
      path: "/drafts",
      status: 201,
      duration_ms: 12
    });
    expect(entry).toMatchObject({
      level: "info",
      msg: "request",
      method: "POST",
      path: "/drafts",
      status: 201,
      duration_ms: 12
    });
  });

  it("carries draft context into the log", () => {
    const entry = buildRequestLog({
      method: "POST",
      path: "/drafts",
      status: 200,
      duration_ms: 5,
      body: { draftId: "d1", user_id: 42 }
    });
    expect(entry.draft_id).toBe("d1");
    expect(entry.user_id).toBe(42);
  });
});
