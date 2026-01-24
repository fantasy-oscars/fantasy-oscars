import { afterEach, afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  DRAFT_NAMESPACE,
  registerDraftNamespace
} from "../../src/realtime/draftNamespace.js";
import {
  clearDraftEventEmitter,
  emitDraftEvent,
  registerDraftEventEmitter
} from "../../src/realtime/draftEvents.js";
import { startTestDatabase, truncateAllTables } from "../db.js";
import { signToken } from "../../src/auth/token.js";
import { insertDraft, insertLeagueMember, insertSeason } from "../factories/db.js";
import {
  ListenPermissionError,
  createTestClient,
  disconnectClient,
  startSocketTestServer,
  waitForEvent,
  type SocketTestServer,
  type TestClient
} from "../support/socket.js";

let server: SocketTestServer | undefined;
let clients: TestClient[] = [];
let db: Awaited<ReturnType<typeof startTestDatabase>> | null = null;
const authSecret = process.env.AUTH_SECRET ?? "test-secret";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

async function waitForDraftEventCount(client: TestClient, count: number) {
  for (let i = 0; i < 50; i += 1) {
    const draftEvents = client.events.filter((entry) => entry.event === "draft:event");
    if (draftEvents.length >= count) return draftEvents;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for draft events");
}

describe("draft event emission", () => {
  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
  });

  afterEach(async () => {
    await Promise.all(clients.map(disconnectClient));
    clients = [];
    if (db) await truncateAllTables(db.pool);
    if (server) {
      await server.close();
      server = undefined;
    }
    clearDraftEventEmitter();
  });

  afterAll(async () => {
    await db?.stop();
  });

  it("emits draft events to the draft room in order", async () => {
    if (!db) throw new Error("db not ready");
    const leagueMember = await insertLeagueMember(db.pool);
    const { rows } = await db.pool.query<{ ceremony_id: number }>(
      `SELECT ceremony_id FROM league WHERE id = $1`,
      [leagueMember.league_id]
    );
    const season = await insertSeason(db.pool, {
      league_id: leagueMember.league_id,
      ceremony_id: rows[0].ceremony_id
    });
    const draft = await insertDraft(db.pool, {
      league_id: leagueMember.league_id,
      season_id: season.id
    });
    await db.pool.query(
      `INSERT INTO season_member (season_id, user_id, league_member_id, role)
       VALUES ($1, $2, $3, 'MEMBER')`,
      [season.id, leagueMember.user_id, leagueMember.id]
    );
    const token = signToken(
      { sub: String(leagueMember.user_id), username: "member" },
      authSecret
    );

    try {
      server = await startSocketTestServer((io) => {
        const nsp = registerDraftNamespace(io, { db: db!.pool, authSecret });
        registerDraftEventEmitter(nsp);
      });
    } catch (err) {
      if (err instanceof ListenPermissionError) return;
      throw err;
    }

    const client = await createTestClient(server, {
      namespace: DRAFT_NAMESPACE,
      socketOptions: {
        query: { draftId: draft.id },
        extraHeaders: { Authorization: `Bearer ${token}` }
      }
    });
    clients = [client];

    expect(await waitForEvent(client, "joined")).toEqual([{ draftId: draft.id }]);

    emitDraftEvent({
      id: 1,
      draft_id: draft.id,
      version: 1,
      event_type: "draft.started",
      payload: { ok: true },
      created_at: new Date()
    });
    emitDraftEvent({
      id: 2,
      draft_id: draft.id,
      version: 2,
      event_type: "draft.pick.submitted",
      payload: { ok: true },
      created_at: new Date()
    });

    const draftEvents = await waitForDraftEventCount(client, 2);
    const versions = draftEvents.map(
      (entry) => (entry.args[0] as { version: number }).version
    );
    expect(versions).toEqual([1, 2]);
  });
});
