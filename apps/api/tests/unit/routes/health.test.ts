import { describe, expect, it } from "vitest";
import { healthHandler } from "../../../src/routes/health.js";

describe("GET /health", () => {
  it("returns ok", async () => {
    let jsonBody: unknown = null;
    const res = {
      json(body: unknown) {
        jsonBody = body;
      }
    };

    healthHandler({}, res);
    expect(jsonBody).toEqual({ ok: true, service: "api", status: "healthy" });
  });
});
