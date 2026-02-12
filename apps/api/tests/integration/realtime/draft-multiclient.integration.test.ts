import { AddressInfo } from "net";
import { createServer as createHttpServer, type Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { signToken } from "../../../src/auth/token.js";
import {
  DRAFT_NAMESPACE,
  registerDraftNamespace
} from "../../../src/realtime/draftNamespace.js";
import {
  clearDraftEventEmitter,
  registerDraftEventEmitter
} from "../../../src/realtime/draftEvents.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import {
  insertDraft,
  insertDraftSeat,
  insertLeague,
  insertLeagueMember,
  insertNomination,
  insertUser
} from "../../factories/db.js";
import {
  createTestClient,
  disconnectClient,
  waitForEvent,
  type SocketTestServer,
  type TestClient
} from "../../support/socket.js";

type JsonResponse<T> = { status: number; json: T };

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let httpServer: HttpServer | null = null;
let socketServer: SocketTestServer | null = null;
let baseUrl: string | null = null;
let clients: TestClient[] = [];

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  opts: { token?: string } = {}
): Promise<JsonResponse<T>> {
  if (!baseUrl) throw new Error("Test server not started");
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const json = (await res.json()) as T;
  return { status: res.status, json };
}

function tokenFor(userId: number, username = `u${userId}`) {
  return signToken(
    { sub: String(userId), username },
    process.env.AUTH_SECRET ?? "test-secret"
  );
}

async function waitForDraftEventCount(client: TestClient, count: number) {
  for (let i = 0; i < 50; i += 1) {
    const draftEvents = client.events.filter((entry) => entry.event === "draft:event");
    if (draftEvents.length >= count) return draftEvents;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for draft events");
}

async function waitForDisconnect(client: TestClient, timeoutMs = 2000) {
  if (!client.socket.connected) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("disconnect timeout")), timeoutMs);
    client.socket.once("disconnect", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

describe("draft realtime integration", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3111";
    process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret";
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;

    const app = createServer({ db: db.pool });
    httpServer = createHttpServer(app);
    const io = new SocketIOServer(httpServer, {
      cors: {
        origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
        credentials: true
      },
      serveClient: false
    });
    const draftNamespace = registerDraftNamespace(io, {
      db: db.pool,
      authSecret: process.env.AUTH_SECRET ?? "test-secret"
    });
    registerDraftEventEmitter(draftNamespace);

    await new Promise<void>((resolve) => {
      httpServer!.listen(0, "127.0.0.1", () => resolve());
    });
    const address = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    socketServer = {
      io,
      url: baseUrl,
      close: async () => {
        await new Promise<void>((resolve) => io.close(() => resolve()));
        await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
      }
    };
  }, 120_000);

  afterEach(async () => {
    await Promise.all(clients.map(disconnectClient));
    clients = [];
    await truncateAllTables(db.pool);
  });

  afterAll(async () => {
    clearDraftEventEmitter();
    if (socketServer) {
      await socketServer.close();
    } else if (httpServer) {
      await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    }
    if (db) await db.stop();
  });

  it("keeps multiple clients in sync through sequential picks", async () => {
    const pool = db.pool;
    const league = await insertLeague(pool);
    const draft = await insertDraft(pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      current_pick_number: 1
    });
    const user1 = await insertUser(pool);
    const user2 = await insertUser(pool);
    const member1 = await insertLeagueMember(pool, {
      league_id: league.id,
      user_id: user1.id
    });
    const member2 = await insertLeagueMember(pool, {
      league_id: league.id,
      user_id: user2.id
    });
    await pool.query(
      `INSERT INTO season_member (season_id, user_id, league_member_id, role)
       VALUES ($1, $2, $3, 'MEMBER'), ($1, $4, $5, 'MEMBER')`,
      [draft.season_id, user1.id, member1.id, user2.id, member2.id]
    );
    await insertDraftSeat(pool, {
      draft_id: draft.id,
      seat_number: 1,
      league_member_id: member1.id
    });
    await insertDraftSeat(pool, {
      draft_id: draft.id,
      seat_number: 2,
      league_member_id: member2.id
    });
    const nomination1 = await insertNomination(pool);
    const nomination2 = await insertNomination(pool);
    const nomination3 = await insertNomination(pool);

    const token1 = tokenFor(user1.id);
    const token2 = tokenFor(user2.id);

    const clientA = await createTestClient(socketServer!, {
      namespace: DRAFT_NAMESPACE,
      socketOptions: {
        query: { draftId: draft.id },
        extraHeaders: { Authorization: `Bearer ${token1}` }
      }
    });
    const clientB = await createTestClient(socketServer!, {
      namespace: DRAFT_NAMESPACE,
      socketOptions: {
        query: { draftId: draft.id },
        extraHeaders: { Authorization: `Bearer ${token2}` }
      }
    });
    clients = [clientA, clientB];

    expect(await waitForEvent(clientA, "joined")).toEqual([{ draftId: draft.id }]);
    expect(await waitForEvent(clientB, "joined")).toEqual([{ draftId: draft.id }]);

    const firstPick = await requestJson<{ pick: { pick_number: number } }>(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination1.id, request_id: "req-1" })
      },
      { token: tokenFor(user1.id) }
    );
    expect(firstPick.status).toBe(201);

    await waitForDraftEventCount(clientA, 1);
    await waitForDraftEventCount(clientB, 1);

    const secondPick = await requestJson<{ pick: { pick_number: number } }>(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination2.id, request_id: "req-2" })
      },
      { token: tokenFor(user2.id) }
    );
    expect(secondPick.status).toBe(201);

    const thirdPick = await requestJson<{ pick: { pick_number: number } }>(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination3.id, request_id: "req-3" })
      },
      { token: tokenFor(user2.id) }
    );
    expect(thirdPick.status).toBe(201);

    const eventsA = await waitForDraftEventCount(clientA, 3);
    const eventsB = await waitForDraftEventCount(clientB, 3);
    const versionsA = eventsA.map(
      (entry) => (entry.args[0] as { version: number }).version
    );
    const versionsB = eventsB.map(
      (entry) => (entry.args[0] as { version: number }).version
    );

    expect(versionsA).toEqual([1, 2, 3]);
    expect(versionsB).toEqual([1, 2, 3]);
  });

  it("recovers on reconnect by loading a snapshot after a missed event", async () => {
    const pool = db.pool;
    const league = await insertLeague(pool);
    const draft = await insertDraft(pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      current_pick_number: 1
    });
    const user1 = await insertUser(pool);
    const user2 = await insertUser(pool);
    const member1 = await insertLeagueMember(pool, {
      league_id: league.id,
      user_id: user1.id
    });
    const member2 = await insertLeagueMember(pool, {
      league_id: league.id,
      user_id: user2.id
    });
    await insertDraftSeat(pool, {
      draft_id: draft.id,
      seat_number: 1,
      league_member_id: member1.id
    });
    await insertDraftSeat(pool, {
      draft_id: draft.id,
      seat_number: 2,
      league_member_id: member2.id
    });
    const nomination1 = await insertNomination(pool);
    const nomination2 = await insertNomination(pool);
    const nomination3 = await insertNomination(pool);

    await pool.query(
      `INSERT INTO season_member (season_id, user_id, league_member_id, role)
       VALUES ($1, $2, $3, 'MEMBER'), ($1, $4, $5, 'MEMBER')`,
      [draft.season_id, user1.id, member1.id, user2.id, member2.id]
    );
    const token1 = tokenFor(user1.id);
    const token2 = tokenFor(user2.id);

    const clientA = await createTestClient(socketServer!, {
      namespace: DRAFT_NAMESPACE,
      socketOptions: {
        query: { draftId: draft.id },
        extraHeaders: { Authorization: `Bearer ${token1}` }
      }
    });
    const clientB = await createTestClient(socketServer!, {
      namespace: DRAFT_NAMESPACE,
      socketOptions: {
        query: { draftId: draft.id },
        extraHeaders: { Authorization: `Bearer ${token2}` }
      }
    });
    clients = [clientA, clientB];

    expect(await waitForEvent(clientA, "joined")).toEqual([{ draftId: draft.id }]);
    expect(await waitForEvent(clientB, "joined")).toEqual([{ draftId: draft.id }]);

    const firstPick = await requestJson<{ pick: { pick_number: number } }>(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination1.id, request_id: "req-1" })
      },
      { token: tokenFor(user1.id) }
    );
    expect(firstPick.status).toBe(201);
    await waitForDraftEventCount(clientA, 1);
    await waitForDraftEventCount(clientB, 1);

    clientB.events.length = 0;
    clientB.socket.disconnect();
    await waitForDisconnect(clientB);

    const secondPick = await requestJson<{ pick: { pick_number: number } }>(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination2.id, request_id: "req-2" })
      },
      { token: tokenFor(user2.id) }
    );
    expect(secondPick.status).toBe(201);

    await waitForDraftEventCount(clientA, 2);

    clientB.socket.connect();
    expect(await waitForEvent(clientB, "joined")).toEqual([{ draftId: draft.id }]);

    const snapshotRes = await requestJson<{
      version: number;
      picks: Array<{ pick_number: number }>;
    }>(`/drafts/${draft.id}/snapshot`, {}, { token: tokenFor(user1.id) });
    expect(snapshotRes.status).toBe(200);
    expect(snapshotRes.json.version).toBe(2);
    expect(snapshotRes.json.picks).toHaveLength(2);

    const thirdPick = await requestJson<{ pick: { pick_number: number } }>(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination3.id, request_id: "req-3" })
      },
      { token: tokenFor(user2.id) }
    );
    expect(thirdPick.status).toBe(201);

    const eventsAfterReconnect = await waitForDraftEventCount(clientB, 1);
    const version = (eventsAfterReconnect[0].args[0] as { version: number }).version;
    expect(version).toBe(3);
  });
});
