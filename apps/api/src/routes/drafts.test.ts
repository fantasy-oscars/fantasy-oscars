import type { Request, Response, NextFunction } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCreateDraftHandler,
  buildExportDraftHandler,
  buildDraftResultsHandler,
  buildDraftStandingsHandler,
  buildSubmitPickHandler,
  buildSnapshotDraftHandler,
  buildPauseDraftHandler,
  buildResumeDraftHandler
} from "./drafts.js";
import { signToken } from "../auth/token.js";
import { AppError } from "../errors.js";
import * as draftRepo from "../data/repositories/draftRepository.js";
import * as leagueRepo from "../data/repositories/leagueRepository.js";
import * as seasonRepo from "../data/repositories/seasonRepository.js";
import * as winnerRepo from "../data/repositories/winnerRepository.js";
import { requireAuth } from "../auth/middleware.js";
import type { DbClient } from "../data/db.js";
import * as db from "../data/db.js";
import * as draftEvents from "../realtime/draftEvents.js";
import type { Pool, PoolClient } from "pg";
import * as appConfigRepo from "../data/repositories/appConfigRepository.js";
import * as draftState from "../domain/draftState.js";

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
  const getSeasonSpy = vi.spyOn(seasonRepo, "getExtantSeasonForLeague");
  const createSeasonSpy = vi.spyOn(seasonRepo, "createExtantSeason");
  const getActiveCeremonySpy = vi.spyOn(appConfigRepo, "getActiveCeremonyId");
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
    getActiveCeremonySpy.mockResolvedValue(99);
    getSeasonSpy.mockResolvedValue({
      id: 500,
      league_id: 1,
      ceremony_id: 99,
      status: "EXTANT",
      scoring_strategy_name: "fixed",
      remainder_strategy: "UNDRAFTED",
      created_at: new Date("2024-01-01T00:00:00Z")
    });
    createSeasonSpy.mockResolvedValue({
      id: 500,
      league_id: 1,
      ceremony_id: 99,
      status: "EXTANT",
      scoring_strategy_name: "fixed",
      remainder_strategy: "UNDRAFTED",
      created_at: new Date("2024-01-01T00:00:00Z")
    });
    createDraftSpy.mockResolvedValue({
      id: 42,
      league_id: 1,
      season_id: 500,
      status: "PENDING",
      draft_order_type: "SNAKE",
      current_pick_number: null,
      picks_per_seat: null,
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
      body: { league_id: 1, draft_order_type: "snake" },
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
        draft_order_type: "SNAKE"
      })
    );
  });

  it("rejects non-snake draft_order_type", async () => {
    const req = mockReq({
      body: { league_id: 1, draft_order_type: "linear" },
      headers: { authorization: authHeader() }
    });
    const { res, state } = mockRes();
    const next = vi.fn();

    auth(req as Request, res as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();

    await handler(req as Request, res as Response, next as NextFunction);

    const err = next.mock.calls[1][0] as AppError;
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);
    expect(state.body).toBeUndefined();
    expect(createDraftSpy).not.toHaveBeenCalled();
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
    getLeagueByIdSpy.mockResolvedValueOnce({
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
    getDraftByLeagueIdSpy.mockResolvedValueOnce({
      id: 1,
      league_id: 1,
      season_id: 500,
      status: "PENDING",
      draft_order_type: "SNAKE",
      current_pick_number: null,
      picks_per_seat: null,
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

describe("POST /drafts/:id/pause and /resume", () => {
  const getDraftByIdForUpdateSpy = vi.spyOn(draftRepo, "getDraftByIdForUpdate");
  const getSeasonByIdSpy = vi.spyOn(seasonRepo, "getSeasonById");
  const getLeagueByIdSpy = vi.spyOn(leagueRepo, "getLeagueById");
  const getLeagueMemberSpy = vi.spyOn(leagueRepo, "getLeagueMember");
  const getActiveCeremonySpy = vi.spyOn(appConfigRepo, "getActiveCeremonyId");
  const updateDraftStatusSpy = vi.spyOn(draftRepo, "updateDraftStatus");
  const createDraftEventSpy = vi.spyOn(draftRepo, "createDraftEvent");
  const emitDraftEventSpy = vi.spyOn(draftEvents, "emitDraftEvent");
  const runInTransactionSpy = vi.spyOn(db, "runInTransaction");
  const transitionDraftStateSpy = vi.spyOn(draftState, "transitionDraftState");

  beforeEach(() => {
    getDraftByIdForUpdateSpy.mockResolvedValue({
      id: 1,
      league_id: 10,
      season_id: 500,
      status: "IN_PROGRESS",
      draft_order_type: "SNAKE",
      current_pick_number: 3,
      picks_per_seat: 2,
      version: 4,
      started_at: new Date("2024-01-01T00:00:00Z"),
      completed_at: null
    });
    getSeasonByIdSpy.mockResolvedValue({
      id: 500,
      league_id: 10,
      ceremony_id: 99,
      status: "EXTANT",
      scoring_strategy_name: "fixed",
      remainder_strategy: "UNDRAFTED",
      created_at: new Date("2024-01-01T00:00:00Z")
    });
    getLeagueByIdSpy.mockResolvedValue({
      id: 10,
      code: "L1",
      name: "Test League",
      ceremony_id: 99,
      max_members: 10,
      roster_size: 5,
      is_public: true,
      created_by_user_id: 1,
      created_at: new Date("2024-01-01T00:00:00Z")
    });
    getLeagueMemberSpy.mockResolvedValue({
      id: 10,
      league_id: 10,
      user_id: 1,
      role: "OWNER",
      joined_at: new Date("2024-01-01T00:00:00Z")
    });
    getActiveCeremonySpy.mockResolvedValue(99);
    updateDraftStatusSpy.mockImplementation(async (_client, _id, status) => ({
      id: 1,
      league_id: 10,
      season_id: 500,
      status,
      draft_order_type: "SNAKE",
      current_pick_number: 3,
      picks_per_seat: 2,
      version: 5,
      started_at: new Date("2024-01-01T00:00:00Z"),
      completed_at: null
    }));
    createDraftEventSpy.mockResolvedValue({
      id: 99,
      draft_id: 1,
      version: 6,
      event_type: "draft.paused",
      payload: {},
      created_at: new Date("2024-01-01T00:00:10Z")
    });
    runInTransactionSpy.mockImplementation(async (_pool, fn) =>
      fn({} as unknown as PoolClient)
    );
    transitionDraftStateSpy.mockImplementation((draft, to) => ({
      ...draft,
      status: to
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("pauses a draft and emits event", async () => {
    const handler = buildPauseDraftHandler({} as unknown as Pool);
    const req = mockReq({
      params: { id: "1" },
      headers: { authorization: authHeader() }
    }) as Request & { auth?: { sub: string } };
    req.auth = { sub: "1" };
    const { res, state } = mockRes();
    const next = vi.fn();

    await handler(req as Request, res as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(state.status).toBe(200);
    expect(updateDraftStatusSpy).toHaveBeenCalledWith(expect.anything(), 1, "PAUSED");
    expect(emitDraftEventSpy).toHaveBeenCalled();
  });

  it("resumes a draft and emits event", async () => {
    getDraftByIdForUpdateSpy.mockResolvedValueOnce({
      id: 1,
      league_id: 10,
      season_id: 500,
      status: "PAUSED",
      draft_order_type: "SNAKE",
      current_pick_number: 3,
      picks_per_seat: 2,
      version: 4,
      started_at: new Date("2024-01-01T00:00:00Z"),
      completed_at: null
    });
    createDraftEventSpy.mockResolvedValueOnce({
      id: 100,
      draft_id: 1,
      version: 7,
      event_type: "draft.resumed",
      payload: {},
      created_at: new Date("2024-01-01T00:00:20Z")
    });
    const handler = buildResumeDraftHandler({} as unknown as Pool);
    const req = mockReq({
      params: { id: "1" },
      headers: { authorization: authHeader() }
    }) as Request & { auth?: { sub: string } };
    req.auth = { sub: "1" };
    const { res, state } = mockRes();
    const next = vi.fn();

    await handler(req as Request, res as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(state.status).toBe(200);
    expect(updateDraftStatusSpy).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "IN_PROGRESS"
    );
    expect(emitDraftEventSpy).toHaveBeenCalled();
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

describe("POST /drafts/:id/results", () => {
  const getDraftByIdSpy = vi.spyOn(draftRepo, "getDraftById");
  const listNominationIdsSpy = vi.spyOn(draftRepo, "listNominationIds");
  const upsertDraftResultsSpy = vi.spyOn(draftRepo, "upsertDraftResults");
  const handler = buildDraftResultsHandler({} as unknown as Pool);

  beforeEach(() => {
    getDraftByIdSpy.mockResolvedValue({
      id: 55,
      league_id: 9,
      season_id: 500,
      status: "COMPLETED",
      draft_order_type: "SNAKE",
      current_pick_number: null,
      picks_per_seat: null,
      version: 4,
      started_at: new Date("2024-01-01T00:00:00Z"),
      completed_at: new Date("2024-01-01T01:00:00Z")
    });
    listNominationIdsSpy.mockResolvedValue([100, 101]);
    upsertDraftResultsSpy.mockResolvedValue();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid draft id", async () => {
    const req = mockReq({
      params: { id: "abc" },
      body: { results: [] }
    });
    const { res, state } = mockRes();
    const next = vi.fn();

    await handler(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = next.mock.calls[0][0] as AppError;
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);
    expect(state.body).toBeUndefined();
  });

  it("rejects unknown nominations", async () => {
    listNominationIdsSpy.mockResolvedValueOnce([100]);
    const req = mockReq({
      params: { id: "55" },
      body: {
        results: [
          { nomination_id: 100, won: true },
          { nomination_id: 101, won: false }
        ]
      }
    });
    const { res, state } = mockRes();
    const next = vi.fn();

    await handler(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = next.mock.calls[0][0] as AppError;
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);
    expect(state.body).toBeUndefined();
    expect(upsertDraftResultsSpy).not.toHaveBeenCalled();
  });

  it("upserts results", async () => {
    const req = mockReq({
      params: { id: "55" },
      body: {
        results: [
          { nomination_id: 100, won: true, points: 1 },
          { nomination_id: 101, won: false }
        ]
      }
    });
    const { res, state } = mockRes();
    const next = vi.fn();

    await handler(req as Request, res as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(state.status).toBe(200);
    expect(upsertDraftResultsSpy).toHaveBeenCalledWith(expect.anything(), 55, [
      { nomination_id: 100, won: true, points: 1 },
      { nomination_id: 101, won: false, points: null }
    ]);
  });
});

describe("GET /drafts/:id/export", () => {
  const getDraftByIdSpy = vi.spyOn(draftRepo, "getDraftById");
  const listDraftSeatsSpy = vi.spyOn(draftRepo, "listDraftSeats");
  const listDraftPicksSpy = vi.spyOn(draftRepo, "listDraftPicks");
  const handler = buildExportDraftHandler({} as unknown as Pool);

  beforeEach(() => {
    getDraftByIdSpy.mockResolvedValue({
      id: 99,
      league_id: 5,
      season_id: 500,
      status: "COMPLETED",
      draft_order_type: "SNAKE",
      current_pick_number: 3,
      picks_per_seat: 2,
      version: 7,
      started_at: new Date("2024-01-01T00:00:00Z"),
      completed_at: new Date("2024-01-01T01:00:00Z")
    });
    listDraftSeatsSpy.mockResolvedValue([
      {
        id: 1,
        draft_id: 99,
        league_member_id: 10,
        seat_number: 1,
        is_active: true,
        user_id: 100
      },
      {
        id: 2,
        draft_id: 99,
        league_member_id: 11,
        seat_number: 2,
        is_active: true,
        user_id: 101
      }
    ]);
    listDraftPicksSpy.mockResolvedValue([
      {
        id: 50,
        draft_id: 99,
        pick_number: 1,
        round_number: 1,
        seat_number: 1,
        league_member_id: 10,
        user_id: 100,
        nomination_id: 200,
        made_at: new Date("2024-01-01T00:05:00Z")
      },
      {
        id: 51,
        draft_id: 99,
        pick_number: 2,
        round_number: 1,
        seat_number: 2,
        league_member_id: 11,
        user_id: 101,
        nomination_id: 201,
        made_at: new Date("2024-01-01T00:06:00Z")
      }
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exports draft participants, picks, and final state", async () => {
    const req = mockReq({
      params: { id: "99" },
      headers: { authorization: authHeader() }
    });
    const { res, state } = mockRes();
    const next = vi.fn();

    await handler(req as Request, res as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(state.status).toBe(200);
    const body = state.body as {
      draft: { id: number; status: string; version: number };
      seats: Array<{ seat_number: number }>;
      picks: Array<{ pick_number: number }>;
    };
    expect(body.draft).toMatchObject({
      id: 99,
      status: "COMPLETED",
      version: 7
    });
    expect(body.seats.map((seat) => seat.seat_number)).toEqual([1, 2]);
    expect(body.picks.map((pick) => pick.pick_number)).toEqual([1, 2]);
  });

  it("rejects invalid draft id", async () => {
    const req = mockReq({ params: { id: "abc" } });
    const { res, state } = mockRes();
    const next = vi.fn();

    await handler(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = next.mock.calls[0][0] as AppError;
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);
    expect(state.body).toBeUndefined();
  });
});

describe("GET /drafts/:id/standings", () => {
  const getDraftByIdSpy = vi.spyOn(draftRepo, "getDraftById");
  const listDraftSeatsSpy = vi.spyOn(draftRepo, "listDraftSeats");
  const listDraftPicksSpy = vi.spyOn(draftRepo, "listDraftPicks");
  const getSeasonByIdSpy = vi.spyOn(seasonRepo, "getSeasonById");
  const listWinnersByCeremonySpy = vi.spyOn(winnerRepo, "listWinnersByCeremony");
  const handler = buildDraftStandingsHandler({} as unknown as Pool);

  beforeEach(() => {
    getDraftByIdSpy.mockResolvedValue({
      id: 77,
      league_id: 5,
      season_id: 500,
      status: "COMPLETED",
      draft_order_type: "SNAKE",
      current_pick_number: null,
      picks_per_seat: 2,
      version: 9,
      started_at: new Date("2024-01-01T00:00:00Z"),
      completed_at: new Date("2024-01-01T01:00:00Z")
    });
    listDraftSeatsSpy.mockResolvedValue([
      {
        id: 1,
        draft_id: 77,
        league_member_id: 10,
        seat_number: 1,
        is_active: true,
        user_id: 100
      },
      {
        id: 2,
        draft_id: 77,
        league_member_id: 11,
        seat_number: 2,
        is_active: true,
        user_id: 101
      }
    ]);
    listDraftPicksSpy.mockResolvedValue([
      {
        id: 1,
        draft_id: 77,
        pick_number: 1,
        round_number: 1,
        seat_number: 1,
        league_member_id: 10,
        user_id: 100,
        nomination_id: 200,
        made_at: new Date("2024-01-01T00:10:00Z")
      },
      {
        id: 2,
        draft_id: 77,
        pick_number: 2,
        round_number: 1,
        seat_number: 2,
        league_member_id: 11,
        user_id: 101,
        nomination_id: 201,
        made_at: new Date("2024-01-01T00:11:00Z")
      }
    ]);
    getSeasonByIdSpy.mockResolvedValue({
      id: 500,
      league_id: 5,
      ceremony_id: 99,
      status: "EXTANT",
      scoring_strategy_name: "fixed",
      created_at: new Date("2024-01-01T00:00:00Z")
    });
    listWinnersByCeremonySpy.mockResolvedValue([
      {
        category_edition_id: 123,
        nomination_id: 200
      }
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns standings with points and picks", async () => {
    const req = mockReq({ params: { id: "77" } });
    const { res, state } = mockRes();
    const next = vi.fn();

    await handler(req as Request, res as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(state.status).toBe(200);
    const body = state.body as {
      standings: Array<{ seat_number: number; points: number }>;
    };
    expect(body.standings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ seat_number: 1, points: 1 }),
        expect.objectContaining({ seat_number: 2, points: 0 })
      ])
    );
  });
});

describe("GET /drafts/:id/snapshot", () => {
  const getDraftByIdSpy = vi.spyOn(draftRepo, "getDraftById");
  const listDraftSeatsSpy = vi.spyOn(draftRepo, "listDraftSeats");
  const listDraftPicksSpy = vi.spyOn(draftRepo, "listDraftPicks");
  const getLeagueByIdSpy = vi.spyOn(leagueRepo, "getLeagueById");
  const getSeasonByIdSpy = vi.spyOn(seasonRepo, "getSeasonById");
  const countNominationsByCeremonySpy = vi.spyOn(draftRepo, "countNominationsByCeremony");
  const handler = buildSnapshotDraftHandler({} as unknown as Pool);

  beforeEach(() => {
    getDraftByIdSpy.mockResolvedValue({
      id: 10,
      league_id: 22,
      season_id: 500,
      status: "IN_PROGRESS",
      draft_order_type: "SNAKE",
      current_pick_number: 2,
      picks_per_seat: 4,
      version: 5,
      started_at: new Date("2024-01-01T00:00:00Z"),
      completed_at: null
    });
    listDraftSeatsSpy.mockResolvedValue([
      {
        id: 1,
        draft_id: 10,
        league_member_id: 11,
        seat_number: 1,
        is_active: true,
        user_id: 201
      },
      {
        id: 2,
        draft_id: 10,
        league_member_id: 12,
        seat_number: 2,
        is_active: true,
        user_id: 202
      }
    ]);
    listDraftPicksSpy.mockResolvedValue([
      {
        id: 100,
        draft_id: 10,
        pick_number: 1,
        round_number: 1,
        seat_number: 1,
        league_member_id: 11,
        user_id: 201,
        nomination_id: 300,
        made_at: new Date("2024-01-01T00:01:00Z"),
        request_id: "req-1"
      }
    ]);
    getLeagueByIdSpy.mockResolvedValue({
      id: 22,
      code: "L1",
      name: "Test League",
      ceremony_id: 99,
      max_members: 10,
      roster_size: 10,
      is_public: true,
      created_by_user_id: 1,
      created_at: new Date("2024-01-01T00:00:00Z")
    });
    getSeasonByIdSpy.mockResolvedValue({
      id: 500,
      league_id: 22,
      ceremony_id: 99,
      status: "EXTANT",
      scoring_strategy_name: "fixed",
      created_at: new Date("2024-01-01T00:00:00Z")
    });
    countNominationsByCeremonySpy.mockResolvedValue(10);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns snapshot with draft version from storage", async () => {
    const req = mockReq({ params: { id: "10" } });
    const { res, state } = mockRes();
    const next = vi.fn();

    await handler(req as Request, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(state.status).toBe(200);
    const body = state.body as {
      draft: { id: number; version: number };
      version: number;
    };
    expect(body.draft.id).toBe(10);
    expect(body.draft.version).toBe(5);
    expect(body.version).toBe(5);
  });
});
