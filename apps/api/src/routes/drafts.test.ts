import type { Request, Response, NextFunction } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCreateDraftHandler, buildSubmitPickHandler } from "./drafts.js";
import { signToken } from "../auth/token.js";
import { AppError } from "../errors.js";
import * as draftRepo from "../data/repositories/draftRepository.js";
import * as leagueRepo from "../data/repositories/leagueRepository.js";
import { requireAuth } from "../auth/middleware.js";
import type { DbClient } from "../data/db.js";
import * as db from "../data/db.js";
import * as draftEvents from "../realtime/draftEvents.js";
import type { Pool } from "pg";

const AUTH_SECRET = "test-secret";

function authHeader() {
  return `Bearer ${signToken({ sub: "1", handle: "tester" }, AUTH_SECRET, 3600)}`;
}

function mockReq(opts: {
  body?: unknown;
  headers?: Record<string, string>;
  params?: Record<string, string>;
}) {
  return {
    body: opts.body ?? {},
    headers: opts.headers ?? {},
    params: opts.params ?? {}
  } as Request;
}

function mockRes() {
  const state: { status?: number; body?: unknown } = {};
  const res: Partial<Response> = {
    status(code: number) {
      state.status = code;
      return this as Response;
    },
    json(payload: unknown) {
      state.body = payload;
      return this as Response;
    }
  };
  return { res: res as Response, state };
}

describe("POST /drafts", () => {
  const createDraftSpy = vi.spyOn(draftRepo, "createDraft");
  const getDraftByLeagueIdSpy = vi.spyOn(draftRepo, "getDraftByLeagueId");
  const getLeagueByIdSpy = vi.spyOn(leagueRepo, "getLeagueById");
  const getLeagueMemberSpy = vi.spyOn(leagueRepo, "getLeagueMember");
  const auth = requireAuth(AUTH_SECRET);
  const handler = buildCreateDraftHandler({} as unknown as DbClient);

  beforeEach(async () => {
    getLeagueByIdSpy.mockResolvedValue({
      id: 1,
      code: "L1",
      name: "Test League",
      ceremony_id: 99,
      max_members: 10,
      roster_size: 5,
      is_public: true,
      created_by_user_id: 1,
      created_at: new Date("2024-01-01T00:00:00Z")
    });
    getDraftByLeagueIdSpy.mockResolvedValue(null);
    getLeagueMemberSpy.mockResolvedValue({
      id: 10,
      league_id: 1,
      user_id: 1,
      role: "OWNER",
      joined_at: new Date("2024-01-01T00:00:00Z")
    });
    createDraftSpy.mockResolvedValue({
      id: 42,
      league_id: 1,
      status: "PENDING",
      draft_order_type: "SNAKE",
      current_pick_number: null,
      version: 0,
      started_at: null,
      completed_at: null
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  it("requires authentication", async () => {
    const req = mockReq({ body: { league_id: 1, draft_order_type: "SNAKE" } });
    const { res, state } = mockRes();
    const next = vi.fn();

    auth(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = next.mock.calls[0][0] as AppError;
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.status).toBe(401);
    expect(state.body).toBeUndefined();
  });

  it("creates a draft when payload is valid", async () => {
    const req = mockReq({
      body: { league_id: 1, draft_order_type: "linear" },
      headers: { authorization: authHeader() }
    });
    const { res, state } = mockRes();
    const next = vi.fn();

    auth(req as Request, res as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();

    await handler(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenLastCalledWith();
    expect(state.status).toBe(201);
    const body = state.body as { draft?: Record<string, unknown> } | undefined;
    expect(body?.draft).toMatchObject({
      id: 42,
      league_id: 1,
      status: "PENDING",
      draft_order_type: "SNAKE"
    });
    expect(createDraftSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        league_id: 1,
        status: "PENDING",
        draft_order_type: "LINEAR"
      })
    );
  });

  it("rejects invalid league_id", async () => {
    const req = mockReq({
      body: { league_id: "abc" },
      headers: { authorization: authHeader() }
    });
    const { res, state } = mockRes();
    const next = vi.fn();

    auth(req as Request, res as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();

    await handler(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = next.mock.calls[1][0] as AppError;
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);
    expect(state.body).toBeUndefined();
    expect(createDraftSpy).not.toHaveBeenCalled();
  });

  it("rejects when league is not found", async () => {
    getLeagueByIdSpy.mockResolvedValueOnce(null);

    const req = mockReq({
      body: { league_id: 1 },
      headers: { authorization: authHeader() }
    });
    const { res, state } = mockRes();
    const next = vi.fn();

    auth(req as Request, res as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();

    await handler(req as Request, res as Response, next as NextFunction);

    const err = next.mock.calls[1][0] as AppError;
    expect(err.code).toBe("LEAGUE_NOT_FOUND");
    expect(err.status).toBe(404);
    expect(state.body).toBeUndefined();
    expect(createDraftSpy).not.toHaveBeenCalled();
  });

  it("rejects when a draft already exists for the league", async () => {
    getDraftByLeagueIdSpy.mockResolvedValueOnce({
      id: 1,
      league_id: 1,
      status: "PENDING",
      draft_order_type: "SNAKE",
      current_pick_number: null,
      version: 0,
      started_at: null,
      completed_at: null
    });

    const req = mockReq({
      body: { league_id: 1 },
      headers: { authorization: authHeader() }
    });
    const { res, state } = mockRes();
    const next = vi.fn();

    auth(req as Request, res as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();

    await handler(req as Request, res as Response, next as NextFunction);

    const err = next.mock.calls[1][0] as AppError;
    expect(err.code).toBe("DRAFT_EXISTS");
    expect(err.status).toBe(409);
    expect(state.body).toBeUndefined();
    expect(createDraftSpy).not.toHaveBeenCalled();
  });
});
// Rate limiting is covered in utils/rateLimiter.test.ts

describe("POST /drafts/:id/picks", () => {
  const getPickByRequestIdSpy = vi.spyOn(draftRepo, "getPickByRequestId");
  const runInTransactionSpy = vi.spyOn(db, "runInTransaction");
  const emitDraftEventSpy = vi.spyOn(draftEvents, "emitDraftEvent");
  const handler = buildSubmitPickHandler({} as unknown as Pool);

  beforeEach(() => {
    getPickByRequestIdSpy.mockResolvedValue(null);
    emitDraftEventSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("emits pick events with the assigned version", async () => {
    const pick = {
      id: 77,
      draft_id: 1,
      pick_number: 1,
      round_number: 1,
      seat_number: 1,
      league_member_id: 10,
      user_id: 22,
      nomination_id: 99,
      made_at: new Date("2024-01-01T00:00:00Z"),
      request_id: "req-1"
    };
    const event = {
      id: 501,
      draft_id: 1,
      version: 7,
      event_type: "draft.pick.submitted",
      payload: {
        pick: {
          pick_number: pick.pick_number,
          seat_number: pick.seat_number,
          nomination_id: pick.nomination_id
        }
      },
      created_at: new Date("2024-01-01T00:00:01Z")
    };
    runInTransactionSpy.mockResolvedValue({ pick, reused: false, event });

    const req = mockReq({
      params: { id: "1" },
      body: { nomination_id: 99, request_id: "req-1" }
    }) as Request & { auth?: { sub: string } };
    req.auth = { sub: "22" };

    const { res, state } = mockRes();
    const next = vi.fn();

    await handler(req as Request, res, next);

    expect(state.status).toBe(201);
    expect(emitDraftEventSpy).toHaveBeenCalledWith(event);
  });
});
