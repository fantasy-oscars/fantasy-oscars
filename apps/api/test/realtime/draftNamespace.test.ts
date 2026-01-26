import { afterEach, afterAll, describe, expect, it, beforeAll, vi } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import {
  DRAFT_NAMESPACE,
  emitToDraft,
  registerDraftNamespace
} from "../../src/realtime/draftNamespace.js";
import { signToken } from "../../src/auth/token.js";
import { startTestDatabase, truncateAllTables } from "../db.js";
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

async function waitForConnectFailure(socket: Socket, timeoutMs = 2000): Promise<Error> {
  return await new Promise<Error>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Expected connection failure")),
      timeoutMs
    );
    const onError = (err: Error) => {
      clearTimeout(timer);
      socket.off("connect", onConnect);
      resolve(err);
    };
    const onConnect = () => {
      clearTimeout(timer);
      socket.off("connect_error", onError);
      reject(new Error("Expected connection failure"));
    };

    socket.once("connect_error", onError);
    socket.once("connect", onConnect);
    socket.connect();
  });
}

describe("draft namespace routing", () => {
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
  });

  afterAll(async () => {
    await db?.stop();
  });

  it("joins draft room on connect and isolates events per draft", async () => {
    try {
      server = await startSocketTestServer((io) => {
        if (!db) throw new Error("db not ready");
        const nsp = registerDraftNamespace(io, { db: db.pool, authSecret });
        nsp.on("connection", (socket) => {
          socket.on("ping-draft", (message: string) => {
            emitToDraft(nsp, (socket.data as { draftId: number }).draftId, "draft-ping", {
              message
            });
          });
        });
      });
    } catch (err) {
      if (err instanceof ListenPermissionError) return;
      throw err;
    }

    const league1 = await insertLeagueMember(db!.pool);
    const { rows: league1Rows } = await db!.pool.query<{ ceremony_id: number }>(
      `SELECT ceremony_id FROM league WHERE id = $1`,
      [league1.league_id]
    );
    const season1 = await insertSeason(db!.pool, {
      league_id: league1.league_id,
      ceremony_id: league1Rows[0].ceremony_id
    });
    const draft1 = await insertDraft(db!.pool, {
      league_id: league1.league_id,
      season_id: season1.id
    });
    // season membership
    await db!.pool.query(
      `INSERT INTO season_member (season_id, user_id, league_member_id, role)
       VALUES ($1, $2, $3, 'MEMBER')`,
      [season1.id, league1.user_id, league1.id]
    );

    const token1 = signToken(
      { sub: String(league1.user_id), username: "user1" },
      authSecret
    );

    const draft1ClientA = await createTestClient(server, {
      namespace: DRAFT_NAMESPACE,
      socketOptions: {
        query: { draftId: draft1.id },
        extraHeaders: { Authorization: `Bearer ${token1}` }
      }
    });
    const draft1ClientB = await createTestClient(server, {
      namespace: DRAFT_NAMESPACE,
      socketOptions: {
        query: { draftId: draft1.id },
        extraHeaders: { Authorization: `Bearer ${token1}` }
      }
    });
    const league2 = await insertLeagueMember(db!.pool);
    const { rows: league2Rows } = await db!.pool.query<{ ceremony_id: number }>(
      `SELECT ceremony_id FROM league WHERE id = $1`,
      [league2.league_id]
    );
    const season2 = await insertSeason(db!.pool, {
      league_id: league2.league_id,
      ceremony_id: league2Rows[0].ceremony_id
    });
    const draft2 = await insertDraft(db!.pool, {
      league_id: league2.league_id,
      season_id: season2.id
    });
    await db!.pool.query(
      `INSERT INTO season_member (season_id, user_id, league_member_id, role)
       VALUES ($1, $2, $3, 'MEMBER')`,
      [season2.id, league2.user_id, league2.id]
    );
    const token2 = signToken(
      { sub: String(league2.user_id), username: "user2" },
      authSecret
    );

    const draft2Client = await createTestClient(server, {
      namespace: DRAFT_NAMESPACE,
      socketOptions: {
        query: { draftId: draft2.id },
        extraHeaders: { Authorization: `Bearer ${token2}` }
      }
    });
    clients = [draft1ClientA, draft1ClientB, draft2Client];

    expect(await waitForEvent(draft1ClientA, "joined")).toEqual([{ draftId: draft1.id }]);
    expect(await waitForEvent(draft1ClientB, "joined")).toEqual([{ draftId: draft1.id }]);
    expect(await waitForEvent(draft2Client, "joined")).toEqual([{ draftId: draft2.id }]);

    draft1ClientA.socket.emit("ping-draft", "hello draft 1");
    expect(await waitForEvent(draft1ClientB, "draft-ping")).toEqual([
      { message: "hello draft 1" }
    ]);

    await expect(waitForEvent(draft2Client, "draft-ping", 200)).rejects.toThrow(
      /Timed out waiting for event/
    );
  });

  it("rejects connections without a draft id", async () => {
    try {
      server = await startSocketTestServer((io) => {
        if (!db) throw new Error("db not ready");
        registerDraftNamespace(io, { db: db.pool, authSecret });
      });
    } catch (err) {
      if (err instanceof ListenPermissionError) return;
      throw err;
    }

    const socket = createClient(`${server.url}${DRAFT_NAMESPACE}`, {
      transports: ["websocket"],
      forceNew: true,
      autoConnect: false
    });

    const error = await waitForConnectFailure(socket);
    expect(error.message).toContain("INVALID_DRAFT_ID");
    socket.disconnect();
  });

  it("rejoins the draft room after reconnect", async () => {
    try {
      server = await startSocketTestServer((io) => {
        if (!db) throw new Error("db not ready");
        const nsp = registerDraftNamespace(io, { db: db.pool, authSecret });
        nsp.on("connection", (socket) => {
          socket.on("ping-draft", (message: string) => {
            emitToDraft(nsp, (socket.data as { draftId: number }).draftId, "draft-ping", {
              message
            });
          });
        });
      });
    } catch (err) {
      if (err instanceof ListenPermissionError) return;
      throw err;
    }

    const league = await insertLeagueMember(db!.pool);
    const { rows: leagueRows } = await db!.pool.query<{ ceremony_id: number }>(
      `SELECT ceremony_id FROM league WHERE id = $1`,
      [league.league_id]
    );
    const season = await insertSeason(db!.pool, {
      league_id: league.league_id,
      ceremony_id: leagueRows[0].ceremony_id
    });
    const draft = await insertDraft(db!.pool, {
      league_id: league.league_id,
      season_id: season.id
    });
    await db!.pool.query(
      `INSERT INTO season_member (season_id, user_id, league_member_id, role)
       VALUES ($1, $2, $3, 'MEMBER')`,
      [season.id, league.user_id, league.id]
    );
    const token = signToken(
      { sub: String(league.user_id), username: "owner" },
      authSecret
    );

    const client = await createTestClient(server, {
      namespace: DRAFT_NAMESPACE,
      socketOptions: {
        query: { draftId: draft.id },
        extraHeaders: { Authorization: `Bearer ${token}` }
      }
    });
    clients = [client];

    expect(await waitForEvent(client, "joined")).toEqual([{ draftId: draft.id }]);

    client.socket.disconnect();
    client.events.length = 0;
    client.socket.connect();

    expect(await waitForEvent(client, "joined")).toEqual([{ draftId: draft.id }]);

    client.socket.emit("ping-draft", "reconnected");
    expect(await waitForEvent(client, "draft-ping")).toEqual([
      { message: "reconnected" }
    ]);
  });

  it("rejects unauthenticated socket connections", async () => {
    try {
      server = await startSocketTestServer((io) => {
        if (!db) throw new Error("db not ready");
        registerDraftNamespace(io, { db: db.pool, authSecret });
      });
    } catch (err) {
      if (err instanceof ListenPermissionError) return;
      throw err;
    }

    const socket = createClient(`${server.url}${DRAFT_NAMESPACE}`, {
      transports: ["websocket"],
      forceNew: true,
      autoConnect: false,
      query: { draftId: 1 }
    });

    const error = await waitForConnectFailure(socket);
    expect(error.message).toContain("Missing auth token");
    socket.disconnect();
  });

  it("rejects when user is not a league/season member", async () => {
    if (!db) throw new Error("db not ready");
    const pool = db.pool;
    const league = await insertLeagueMember(pool);
    const { rows: leagueRows } = await pool.query<{ ceremony_id: number }>(
      `SELECT ceremony_id FROM league WHERE id = $1`,
      [league.league_id]
    );
    const season = await insertSeason(pool, {
      league_id: league.league_id,
      ceremony_id: leagueRows[0].ceremony_id
    });
    const draft = await insertDraft(pool, {
      league_id: league.league_id,
      season_id: season.id
    });

    try {
      server = await startSocketTestServer((io) => {
        registerDraftNamespace(io, { db: pool, authSecret });
      });
    } catch (err) {
      if (err instanceof ListenPermissionError) return;
      throw err;
    }

    const outsiderToken = signToken({ sub: "999", username: "outsider" }, authSecret);
    const socket = createClient(`${server.url}${DRAFT_NAMESPACE}`, {
      transports: ["websocket"],
      forceNew: true,
      autoConnect: false,
      query: { draftId: draft.id },
      extraHeaders: { Authorization: `Bearer ${outsiderToken}` }
    });

    const error = await waitForConnectFailure(socket);
    expect(error.message).toMatch(/FORBIDDEN|Not a league member/i);
    socket.disconnect();
  });
});
