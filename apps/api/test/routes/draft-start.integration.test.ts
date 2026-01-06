import { AddressInfo } from "net";
import type { Server } from "http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../db.js";
import { insertDraft, insertLeague, insertDraftSeat } from "../factories/db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>> | null = null;
let server: Server | null = null;
let baseUrl: string | null = null;
let skip = false;

async function requestJson<T>(
  path: string,
  init: RequestInit = {}
): Promise<{ status: number; json: T }> {
  if (!baseUrl) throw new Error("Test server not started");
  const res = await fetch(`${baseUrl}${path}`, init);
  const json = (await res.json()) as T;
  return { status: res.status, json };
}

async function post<T>(
  path: string,
  body: unknown
): Promise<{ status: number; json: T }> {
  return requestJson<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("draft start integration", () => {
  beforeAll(async () => {
    try {
      process.env.PORT = process.env.PORT ?? "3103";
      process.env.AUTH_SECRET = "test-secret";
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      const app = createServer({ db: db.pool });
      server = app.listen(0);
      const address = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("container runtime")) {
        skip = true;
        return;
      }
      throw err;
    }
  }, 120_000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    if (db) await db.stop();
  });

  beforeEach(async () => {
    if (skip || !db) return;
    await truncateAllTables(db.pool);
  });

  it("starts a draft and sets current_pick_number", async () => {
    if (skip || !db) return;
    const league = await insertLeague(db.pool);
    const draft = await insertDraft(db.pool, { league_id: league.id, status: "PENDING" });
    await insertDraftSeat(db.pool, { draft_id: draft.id });

    const res = await post<{
      draft: { id: number; status: string; current_pick_number: number };
    }>(`/drafts/${draft.id}/start`, {});
    expect(res.status).toBe(200);
    expect(res.json.draft.status).toBe("IN_PROGRESS");
    expect(res.json.draft.current_pick_number).toBe(1);
  });

  it("rejects when already started", async () => {
    if (skip || !db) return;
    const league = await insertLeague(db.pool);
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      current_pick_number: 1
    });
    const res = await post<{ error: { code: string } }>(`/drafts/${draft.id}/start`, {});
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("DRAFT_ALREADY_STARTED");
  });

  it("rejects when no seats", async () => {
    if (skip || !db) return;
    const league = await insertLeague(db.pool);
    const draft = await insertDraft(db.pool, { league_id: league.id, status: "PENDING" });
    const res = await post<{ error: { code: string } }>(`/drafts/${draft.id}/start`, {});
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("PREREQ_MISSING_SEATS");
  });

  it("rejects when draft missing", async () => {
    if (skip) return;
    const res = await post<{ error: { code: string } }>(`/drafts/999/start`, {});
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe("DRAFT_NOT_FOUND");
  });
});
