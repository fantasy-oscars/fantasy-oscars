import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import crypto from "crypto";
import { createServer } from "../../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import {
  insertCeremony,
  insertDraft,
  insertLeague,
  insertLeagueMember,
  insertSeason,
  insertUser
} from "../../factories/db.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";
import { resetAllRateLimiters } from "../../../src/utils/rateLimiter.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let authSecret = "test-secret";
let api: ApiAgent;

function signToken(claims: Record<string, unknown>) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac("sha256", authSecret)
    .update(data)
    .digest("base64url");
  return `${data}.${signature}`;
}

async function postJson<T>(
  path: string,
  body: Record<string, unknown>,
  token?: string
): Promise<{ status: number; json: T }> {
  const req = api.post(path).set("content-type", "application/json").send(body);
  if (token) req.set("Authorization", `Bearer ${token}`);
  const res = await req;
  return { status: res.status, json: res.body as T };
}

async function getJson<T>(
  path: string,
  token?: string
): Promise<{ status: number; json: T }> {
  const req = api.get(path);
  if (token) req.set("Authorization", `Bearer ${token}`);
  const res = await req;
  return { status: res.status, json: res.body as T };
}

async function patchJson<T>(
  path: string,
  body: Record<string, unknown>,
  token?: string
): Promise<{ status: number; json: T }> {
  const req = api.patch(path).set("content-type", "application/json").send(body);
  if (token) req.set("Authorization", `Bearer ${token}`);
  const res = await req;
  return { status: res.status, json: res.body as T };
}

async function bootstrapSeasonWithOwner() {
  const ceremony = await insertCeremony(db.pool);
  const owner = await insertUser(db.pool);
  const league = await insertLeague(db.pool, {
    ceremony_id: ceremony.id,
    created_by_user_id: owner.id
  });
  const leagueMember = await insertLeagueMember(db.pool, {
    league_id: league.id,
    user_id: owner.id,
    role: "OWNER"
  });
  const season = await insertSeason(db.pool, {
    league_id: league.id,
    ceremony_id: ceremony.id,
    status: "EXTANT"
  });
  await db.pool.query(
    `INSERT INTO season_member (season_id, user_id, league_member_id, role)
     VALUES ($1, $2, $3, 'OWNER')`,
    [season.id, owner.id, leagueMember.id]
  );
  return {
    ceremony,
    owner,
    league,
    season,
    token: signToken({ sub: String(owner.id), username: owner.username })
  };
}

describe("seasons placeholder invites", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3105";
    process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret";
    authSecret = process.env.AUTH_SECRET;
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    const app = createServer({ db: db.pool });
    api = createApiAgent(app);
  }, 120_000);

  afterAll(async () => {
    if (db) await db.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(db.pool);
    resetAllRateLimiters();
  });

  it("commissioner can create a placeholder invite and receive the token once", async () => {
    const { season, token: ownerToken } = await bootstrapSeasonWithOwner();

    const res = await postJson<{
      invite: { id: number; status: string; label: string | null };
      token: string;
    }>(`/seasons/${season.id}/invites`, { label: "VIP" }, ownerToken);

    expect(res.status).toBe(201);
    expect(res.json.token).toBeTruthy();
    expect(res.json.invite.status).toBe("PENDING");
    expect(res.json.invite.label).toBe("VIP");
    expect((res.json.invite as Record<string, unknown>).token_hash).toBeUndefined();

    const { rows } = await db.pool.query<{ token_hash: string; status: string }>(
      `SELECT token_hash, status FROM season_invite WHERE id = $1`,
      [res.json.invite.id]
    );
    const hash = crypto.createHash("sha256").update(res.json.token).digest("hex");
    expect(rows[0].status).toBe("PENDING");
    expect(rows[0].token_hash).toBe(hash);
  });

  it("lists placeholder invites with current statuses", async () => {
    const { season, token: ownerToken } = await bootstrapSeasonWithOwner();

    const inviteOne = await postJson<{ invite: { id: number } }>(
      `/seasons/${season.id}/invites`,
      {},
      ownerToken
    );
    const inviteTwo = await postJson<{ invite: { id: number } }>(
      `/seasons/${season.id}/invites`,
      { label: "Second" },
      ownerToken
    );

    await db.pool.query(`UPDATE season_invite SET status = 'CLAIMED' WHERE id = $1`, [
      inviteOne.json.invite.id
    ]);
    await db.pool.query(`UPDATE season_invite SET status = 'REVOKED' WHERE id = $1`, [
      inviteTwo.json.invite.id
    ]);

    const res = await getJson<{
      invites: Array<{ id: number; status: string; label: string | null }>;
    }>(`/seasons/${season.id}/invites`, ownerToken);

    expect(res.status).toBe(200);
    const statuses = res.json.invites.map((i) => i.status).sort();
    expect(statuses).toEqual(["CLAIMED", "REVOKED"]);
  });

  it("revokes a pending invite", async () => {
    const { season, token: ownerToken } = await bootstrapSeasonWithOwner();
    const created = await postJson<{ invite: { id: number } }>(
      `/seasons/${season.id}/invites`,
      {},
      ownerToken
    );

    const res = await postJson<{ invite: { status: string } }>(
      `/seasons/${season.id}/invites/${created.json.invite.id}/revoke`,
      {},
      ownerToken
    );

    expect(res.status).toBe(200);
    expect(res.json.invite.status).toBe("REVOKED");
  });

  it("regenerates a pending invite, revoking the prior token", async () => {
    const { season, token: ownerToken } = await bootstrapSeasonWithOwner();
    const created = await postJson<{ invite: { id: number } }>(
      `/seasons/${season.id}/invites`,
      { label: "Initial" },
      ownerToken
    );

    const res = await postJson<{
      invite: { id: number; status: string; label: string | null };
      token: string;
    }>(
      `/seasons/${season.id}/invites/${created.json.invite.id}/regenerate`,
      {},
      ownerToken
    );

    expect(res.status).toBe(200);
    expect(res.json.invite.status).toBe("PENDING");
    expect(res.json.invite.label).toBe("Initial");
    expect(res.json.token).toBeTruthy();

    const { rows: oldRows } = await db.pool.query<{ status: string }>(
      `SELECT status FROM season_invite WHERE id = $1`,
      [created.json.invite.id]
    );
    expect(oldRows[0].status).toBe("REVOKED");

    const hash = crypto.createHash("sha256").update(res.json.token).digest("hex");
    const { rows: newRows } = await db.pool.query<{ token_hash: string }>(
      `SELECT token_hash FROM season_invite WHERE id = $1`,
      [res.json.invite.id]
    );
    expect(newRows[0].token_hash).toBe(hash);
  });

  it("updates label only while pending", async () => {
    const { season, token: ownerToken } = await bootstrapSeasonWithOwner();
    const created = await postJson<{ invite: { id: number; label: string | null } }>(
      `/seasons/${season.id}/invites`,
      { label: "Initial" },
      ownerToken
    );

    const res = await patchJson<{ invite: { label: string | null } }>(
      `/seasons/${season.id}/invites/${created.json.invite.id}`,
      { label: "Team A" },
      ownerToken
    );

    expect(res.status).toBe(200);
    expect(res.json.invite.label).toBe("Team A");

    await db.pool.query(`UPDATE season_invite SET status = 'CLAIMED' WHERE id = $1`, [
      created.json.invite.id
    ]);

    const resBlocked = await patchJson<{ error: { code: string } }>(
      `/seasons/${season.id}/invites/${created.json.invite.id}`,
      { label: "Late" },
      ownerToken
    );
    expect(resBlocked.status).toBe(404);
    expect(resBlocked.json.error.code).toBe("INVITE_NOT_FOUND");
  });

  it("requires commissioner role for invite management", async () => {
    const { league, season, token: ownerToken } = await bootstrapSeasonWithOwner();
    const member = await insertUser(db.pool, { username: "member1" });
    const leagueMember = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: member.id,
      role: "MEMBER"
    });
    await db.pool.query(
      `INSERT INTO season_member (season_id, user_id, league_member_id, role)
       VALUES ($1, $2, $3, 'MEMBER')`,
      [season.id, member.id, leagueMember.id]
    );
    const memberToken = signToken({ sub: String(member.id), username: member.username });

    const res = await postJson<{ error: { code: string } }>(
      `/seasons/${season.id}/invites`,
      {},
      memberToken
    );
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("FORBIDDEN");

    // sanity: owner still works
    const ownerRes = await postJson<{ invite: { id: number } }>(
      `/seasons/${season.id}/invites`,
      {},
      ownerToken
    );
    expect(ownerRes.status).toBe(201);
  });

  it("rate limits invite accept attempts", async () => {
    const { season, token: ownerToken } = await bootstrapSeasonWithOwner();
    const inviteRes = await postJson<{
      invite: { id: number };
      token: string;
    }>(`/seasons/${season.id}/invites`, {}, ownerToken);

    const invited = await insertUser(db.pool, { username: "invitee" });
    const invitedToken = signToken({
      sub: String(invited.id),
      username: invited.username
    });

    let finalStatus = 0;
    for (let i = 0; i < 12; i++) {
      const res = await postJson<{ error?: { code: string } }>(
        `/seasons/invites/${inviteRes.json.invite.id}/accept`,
        {},
        invitedToken
      );
      finalStatus = res.status;
    }
    expect(finalStatus).toBe(429);
  });

  it("locks invite changes once drafts have started for the ceremony", async () => {
    const { league, season, token: ownerToken } = await bootstrapSeasonWithOwner();
    await insertDraft(db.pool, {
      league_id: league.id,
      season_id: season.id,
      status: "IN_PROGRESS"
    });

    const res = await postJson<{ error: { code: string } }>(
      `/seasons/${season.id}/invites`,
      {},
      ownerToken
    );
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("INVITES_LOCKED");
  });
});

describe("seasons user-targeted invites", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3105";
    process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret";
    authSecret = process.env.AUTH_SECRET;
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    const app = createServer({ db: db.pool });
    api = createApiAgent(app);
  }, 120_000);

  afterAll(async () => {
    if (db) await db.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(db.pool);
  });

  it("creates a user-targeted invite and returns existing pending invite idempotently", async () => {
    const { season, token: ownerToken } = await bootstrapSeasonWithOwner();
    const invitee = await insertUser(db.pool, { username: "invitee" });

    const first = await postJson<{ invite: { id: number; status: string } }>(
      `/seasons/${season.id}/user-invites`,
      { user_id: invitee.id },
      ownerToken
    );
    expect(first.status).toBe(201);

    const second = await postJson<{ invite: { id: number; status: string } }>(
      `/seasons/${season.id}/user-invites`,
      { user_id: invitee.id },
      ownerToken
    );
    expect(second.status).toBe(200);
    expect(second.json.invite.id).toBe(first.json.invite.id);
  });

  it("rejects inviting yourself to a season", async () => {
    const { season, owner, token: ownerToken } = await bootstrapSeasonWithOwner();

    const res = await postJson<{ error: { code: string } }>(
      `/seasons/${season.id}/user-invites`,
      { user_id: owner.id },
      ownerToken
    );
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("SELF_INVITE_NOT_ALLOWED");
  });

  it("lists pending invites in the invitee inbox", async () => {
    const { season, token: ownerToken } = await bootstrapSeasonWithOwner();
    const invitee = await insertUser(db.pool, { username: "inbox" });
    await postJson(
      `/seasons/${season.id}/user-invites`,
      { user_id: invitee.id },
      ownerToken
    );

    const inbox = await getJson<{
      invites: Array<{ season_id: number; league_id: number | null }>;
    }>(
      `/seasons/invites/inbox`,
      signToken({ sub: String(invitee.id), username: invitee.username })
    );

    expect(inbox.status).toBe(200);
    expect(inbox.json.invites.length).toBe(1);
    expect(inbox.json.invites[0].season_id).toBe(season.id);
  });

  it("accepts a user-targeted invite and creates memberships", async () => {
    const { season, league, token: ownerToken } = await bootstrapSeasonWithOwner();
    const invitee = await insertUser(db.pool, { username: "accept" });
    await postJson(
      `/seasons/${season.id}/user-invites`,
      { user_id: invitee.id },
      ownerToken
    );
    const inviteeToken = signToken({
      sub: String(invitee.id),
      username: invitee.username
    });

    const inbox = await getJson<{ invites: Array<{ id: number }> }>(
      `/seasons/invites/inbox`,
      inviteeToken
    );
    const inviteId = inbox.json.invites[0].id;

    const res = await postJson<{ invite: { status: string } }>(
      `/seasons/invites/${inviteId}/accept`,
      {},
      inviteeToken
    );
    // Include response payload in assertion failure output without emitting logs during passing runs.
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json.invite.status).toBe("CLAIMED");

    const { rows: seasonMembers } = await db.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM season_member WHERE season_id = $1 AND user_id = $2`,
      [season.id, invitee.id]
    );
    expect(Number(seasonMembers[0].count)).toBe(1);

    const { rows: leagueMembers } = await db.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM league_member WHERE league_id = $1 AND user_id = $2`,
      [league.id, invitee.id]
    );
    expect(Number(leagueMembers[0].count)).toBe(1);
  });

  it("declines an invite and removes it from inbox", async () => {
    const { season, token: ownerToken } = await bootstrapSeasonWithOwner();
    const invitee = await insertUser(db.pool, { username: "decline" });
    await postJson(
      `/seasons/${season.id}/user-invites`,
      { user_id: invitee.id },
      ownerToken
    );
    const inviteeToken = signToken({
      sub: String(invitee.id),
      username: invitee.username
    });
    const inbox = await getJson<{ invites: Array<{ id: number }> }>(
      `/seasons/invites/inbox`,
      inviteeToken
    );
    const inviteId = inbox.json.invites[0].id;

    const res = await postJson<{ invite: { status: string } }>(
      `/seasons/invites/${inviteId}/decline`,
      {},
      inviteeToken
    );
    expect(res.status).toBe(200);
    expect(res.json.invite.status).toBe("DECLINED");

    const inboxAfter = await getJson<{ invites: Array<{ id: number }> }>(
      `/seasons/invites/inbox`,
      inviteeToken
    );
    expect(inboxAfter.json.invites.length).toBe(0);
  });

  it("locks creation when drafts have started", async () => {
    const { season, league, token: ownerToken } = await bootstrapSeasonWithOwner();
    await insertDraft(db.pool, {
      league_id: league.id,
      season_id: season.id,
      status: "IN_PROGRESS"
    });
    const invitee = await insertUser(db.pool, { username: "locked" });

    const res = await postJson<{ error: { code: string } }>(
      `/seasons/${season.id}/user-invites`,
      { user_id: invitee.id },
      ownerToken
    );
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("INVITES_LOCKED");
  });
});
