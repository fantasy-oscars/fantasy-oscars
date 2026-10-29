import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "@/lib/api";

function mockError(status: number, error: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status,
      headers: { get: () => null },
      json: async () => ({ error })
    }))
  );
}

describe("fetchJson error messages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the server message for validation errors", async () => {
    mockError(400, { code: "VALIDATION_ERROR", message: "Name is required" });
    const res = await fetchJson("/x");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Name is required");
  });

  it("falls back to generic text when a validation error has no usable message", async () => {
    for (const message of [undefined, "", "   ", "Unexpected error"]) {
      mockError(400, { code: "VALIDATION_ERROR", message });
      const res = await fetchJson("/x");
      expect(res.error).toBe("Please check the highlighted fields and try again.");
    }
  });

  it("keeps the friendly credential and duplicate-user messages", async () => {
    mockError(401, { code: "INVALID_CREDENTIALS", message: "raw" });
    expect((await fetchJson("/x")).error).toBe("Incorrect username or password.");
    mockError(409, { code: "USER_EXISTS", message: "raw" });
    expect((await fetchJson("/x")).error).toBe(
      "That username or email is already in use."
    );
  });
});
