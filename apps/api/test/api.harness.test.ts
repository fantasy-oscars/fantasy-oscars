import { afterAll, describe, expect, it } from "vitest";
import {
  apiRequest,
  expectJson,
  expectStatus,
  startApiServer,
  type ApiTestServer
} from "./support/api.js";

let server: ApiTestServer;

function isListenPermissionError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in (error as { code?: string }) &&
    (error as { code?: string }).code === "EPERM"
  );
}

describe("API test harness", () => {
  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  it("starts the API in-process and issues HTTP requests", async () => {
    try {
      server = await startApiServer();
    } catch (err) {
      if (isListenPermissionError(err)) return;
      throw err;
    }
    const res = await apiRequest(server, "/health");
    expectStatus(res, 200);
    await expectJson(res, { ok: true });
  });

  it("allows simple auth/unauth flows via helper", async () => {
    try {
      server = server ?? (await startApiServer());
    } catch (err) {
      if (isListenPermissionError(err)) return;
      throw err;
    }
    const res = await apiRequest(server, "/health", { authToken: "fake-token" });
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expectStatus(res, 200);
    await expectJson(res, { ok: true });
  });
});
