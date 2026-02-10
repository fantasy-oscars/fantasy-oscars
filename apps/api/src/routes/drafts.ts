import express from "express";
import type { Router } from "express";
import { AppError, validationError } from "../errors.js";
import {
  createDraft,
  getDraftById,
  getDraftBySeasonId,
  updateDraftOnStart,
  updateDraftCurrentPick,
  updateDraftOnComplete,
  getDraftByIdForUpdate,
  updateDraftStatus,
  countDraftSeats,
  createDraftSeats,
  countNominationsByCeremony,
  listDraftSeats,
  listDraftPicks,
  countDraftPicks,
  getPickByNomination,
  getPickByNumber,
  getPickByRequestId,
  insertDraftPickRecord,
  getNominationByIdForCeremony,
  completeDraftIfReady,
  createDraftEvent,
  updateDraftTimer,
  setDraftLockOverride
} from "../data/repositories/draftRepository.js";
import {
  listNominationsForCeremony
} from "../data/repositories/nominationRepository.js";
import type {
  DraftPickRecord,
  DraftRecord
} from "../data/repositories/draftRepository.js";
import {
  getLeagueById,
  getLeagueMember,
  getDraftSeatForUser
} from "../data/repositories/leagueRepository.js";
import { getSeasonById } from "../data/repositories/seasonRepository.js";
import { getCeremonyDraftLockedAt } from "../data/repositories/ceremonyRepository.js";
import {
  getSeasonMember,
  listSeasonMembers
} from "../data/repositories/seasonMemberRepository.js";
import type { DbClient } from "../data/db.js";
import { query, runInTransaction } from "../data/db.js";
import { mapDraftStateError, transitionDraftState } from "../domain/draftState.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { computePickAssignment } from "../domain/draftOrder.js";
import { revokePendingInvitesForSeason } from "../data/repositories/seasonInviteRepository.js";
import { listWinnersByCeremony } from "../data/repositories/winnerRepository.js";
import type { Pool } from "pg";
import { SlidingWindowRateLimiter } from "../utils/rateLimiter.js";
import {
  computeDeadline,
  resolvePicksPerSeat,
  resolveTotalRequiredPicks
} from "../domain/draftPickRules.js";
import {
  getDraftAutodraftConfig,
  listDraftPlanNominationIdsForUserCeremony,
  upsertDraftAutodraftConfig
} from "../data/repositories/draftAutodraftRepository.js";
import { emitDraftEvent } from "../realtime/draftEvents.js";
import { getDraftBoardForCeremony } from "../domain/draftBoard.js";
import { getWisdomBenchmarkForCeremony } from "../data/repositories/wisdomBenchmarkRepository.js";
import {
  recomputeWisdomBenchmarkForCeremony,
  recomputeWisdomBenchmarkForCeremonyTx
} from "../services/benchmarking/wisdomOfCrowds.js";
import {
  buildDraftResultsHandler as buildDraftResultsHandlerImpl,
  buildDraftStandingsHandler as buildDraftStandingsHandlerImpl,
  buildExportDraftHandler as buildExportDraftHandlerImpl
} from "./drafts/read.js";
import {
  chooseAlphabetical,
  chooseAlphabeticalThenCategory,
  chooseByCategoryOrder,
  chooseCanonical,
  chooseCustomUser,
  chooseRandomized,
  resolveStrategy,
  type AutoPickConfig
} from "../domain/autodraftStrategies.js";

const pickRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 2000,
  max: 3
});

type RemainderStrategy = "UNDRAFTED" | "FULL_POOL";

async function autoPickOne(options: {
  tx: DbClient;
  draft: DraftRecord;
  season: { id: number; ceremony_id: number };
  league: { roster_size: number | string | null };
  reason: "TIMER_EXPIRED" | "USER_AUTODRAFT";
  force: boolean;
}) {
  const { tx, draft, season, league, reason, force } = options;
  if (draft.status !== "IN_PROGRESS") return draft;
  // Timer expiry requires deadline/timer, but user-enabled auto-draft is allowed even
  // for untimed drafts (force=true).
  if (!force) {
    if (!draft.pick_deadline_at || draft.pick_timer_seconds === null) return draft;
    const nowMs = Date.now();
    const deadlineMs = new Date(draft.pick_deadline_at).getTime();
    if (!Number.isFinite(deadlineMs)) return draft;
    if (nowMs <= deadlineMs) return draft;
  }

  const seats = await listDraftSeats(tx, draft.id);
  const seatCount = seats.length;
  if (seatCount === 0) return draft;

  const picks = await listDraftPicks(tx, draft.id);
  const picksPerSeat = resolvePicksPerSeat(draft, league);
  const currentPickNumber =
    draft.current_pick_number ??
    Math.max(picks.length + 1, draft.current_pick_number ?? 1);

  const assignment = computePickAssignment({
    draft_order_type: "SNAKE",
    seat_count: seatCount,
    pick_number: currentPickNumber,
    status: draft.status
  });
  const seat = seats.find((s) => s.seat_number === assignment.seat_number);
  if (!seat || !seat.user_id) {
    // Cannot auto-pick without a user; leave as-is.
    return draft;
  }

  const pickedIds = new Set(picks.map((p) => p.nomination_id));
  const allNoms = await listNominationsForCeremony(tx, season.ceremony_id);
  const available = allNoms.filter((n) => !pickedIds.has(n.id));
  if (available.length === 0) {
    return draft;
  }

  const categorySortIndexById = new Map<number, number>();
  const categoryRes = await tx.query<{ id: number; sort_index: number }>(
    `SELECT id::int, sort_index::int
     FROM category_edition
     WHERE ceremony_id = $1
     ORDER BY sort_index ASC, id ASC`,
    [season.ceremony_id]
  );
  for (const r of categoryRes.rows ?? []) {
    categorySortIndexById.set(Number(r.id), Number(r.sort_index) || 0);
  }

  const strategy = resolveStrategy(draft.auto_pick_strategy);
  const availableIds = available.map((n) => n.id);

  let chosen: number | undefined;
  let seedUsed = draft.auto_pick_seed ?? null;

  // Per-user auto-draft (opt-in): if enabled for this seat, it overrides the draft-level default.
  const userAuto = await getDraftAutodraftConfig(tx, {
    draft_id: draft.id,
    user_id: seat.user_id
  });
  const userEnabled = Boolean(userAuto?.enabled);
  const userStrategy = userAuto?.strategy ?? "RANDOM";

  if (userEnabled && userStrategy === "PLAN" && userAuto?.plan_id) {
    const planIds = await listDraftPlanNominationIdsForUserCeremony(tx, {
      plan_id: userAuto.plan_id,
      user_id: seat.user_id,
      ceremony_id: season.ceremony_id
    });
    chosen = planIds.find((id) => availableIds.includes(id));
  }

  if (userEnabled && userStrategy === "BY_CATEGORY" && !chosen) {
    chosen = chooseByCategoryOrder({ available, categorySortIndexById });
  }

  if (userEnabled && userStrategy === "ALPHABETICAL" && !chosen) {
    chosen = chooseAlphabeticalThenCategory({ available, categorySortIndexById });
  }

  if (userEnabled && userStrategy === "WISDOM" && !chosen) {
    const benchmark = await getWisdomBenchmarkForCeremony(tx, season.ceremony_id);
    const scoreByNominationId = new Map<number, number>();
    for (const row of benchmark?.items ?? []) {
      scoreByNominationId.set(Number(row.nomination_id), Number(row.score));
    }

    const seasonRow = await tx.query<{
      scoring_strategy_name: string | null;
      category_weights: unknown;
    }>(
      `SELECT scoring_strategy_name, category_weights FROM season WHERE id = $1 LIMIT 1`,
      [season.id]
    );
    const scoring = String(seasonRow.rows[0]?.scoring_strategy_name ?? "fixed");
    const weightsRaw = seasonRow.rows[0]?.category_weights ?? null;
    const weightsMap =
      typeof weightsRaw === "object" && weightsRaw
        ? (weightsRaw as Record<string, unknown>)
        : {};
    const weightsByCategory: Record<number, number> = {};
    for (const [k, v] of Object.entries(weightsMap)) {
      const keyNum = Number(k);
      const valNum = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(keyNum) || !Number.isFinite(valNum)) continue;
      weightsByCategory[keyNum] = Math.trunc(valNum);
    }
    const fallbackW = scoring === "negative" ? -1 : 1;

    let best: { id: number; u: number } | null = null;
    for (const n of available) {
      const sVal = scoreByNominationId.get(n.id);
      if (!sVal) continue;
      const w =
        scoring === "category_weighted"
          ? (weightsByCategory[n.category_edition_id] ?? 1)
          : fallbackW;
      const u = sVal * w;
      if (!best || u > best.u || (u === best.u && n.id < best.id)) {
        best = { id: n.id, u };
      }
    }
    chosen = best?.id;
  }

  if (userEnabled && userStrategy === "RANDOM" && !chosen) {
    const result = chooseRandomized(availableIds, seedUsed);
    chosen = result.id;
    seedUsed = result.seed;
    if (!draft.auto_pick_seed && seedUsed) {
      await tx.query(`UPDATE draft SET auto_pick_seed = $2 WHERE id = $1`, [
        draft.id,
        seedUsed
      ]);
    }
  }

  // Fall back to the season/draft-level strategy if the user has not enabled auto-draft,
  // or their chosen override does not yield an available nomination.
  if (!chosen) {
    switch (strategy) {
      case "ALPHABETICAL":
        chosen = chooseAlphabetical(
          available,
          (draft.auto_pick_config as AutoPickConfig)?.alphabetical_field
        );
        break;
      case "CANONICAL":
        chosen = chooseCanonical(availableIds, draft.auto_pick_config as AutoPickConfig);
        break;
      case "CUSTOM_USER":
        chosen = chooseCustomUser(
          seat.user_id,
          availableIds,
          draft.auto_pick_config as AutoPickConfig
        );
        break;
      case "SMART":
        chosen =
          chooseCanonical(availableIds, draft.auto_pick_config as AutoPickConfig) ??
          (draft.auto_pick_config as AutoPickConfig | undefined)?.smart_priorities?.find(
            (id) => availableIds.includes(id)
          );
        break;
      case "RANDOM_SEED": {
        const result = chooseRandomized(availableIds, seedUsed);
        chosen = result.id;
        seedUsed = result.seed;
        if (!draft.auto_pick_seed && seedUsed) {
          await tx.query(`UPDATE draft SET auto_pick_seed = $2 WHERE id = $1`, [
            draft.id,
            seedUsed
          ]);
        }
        break;
      }
      case "NEXT_AVAILABLE":
      default:
        // `available` preserves ceremony/category ordering from `listNominationsForCeremony`.
        // Prefer the first available in that canonical order (not lowest id).
        chosen = available[0]?.id;
        break;
    }
  }

  if (!chosen) {
    chosen = available[0]?.id ?? availableIds.sort((a, b) => a - b)[0];
  }

  const nowPick = new Date();
  const pick: DraftPickRecord = await insertDraftPickRecord(tx, {
    draft_id: draft.id,
    pick_number: currentPickNumber,
    round_number: Math.ceil(currentPickNumber / seatCount),
    seat_number: assignment.seat_number,
    league_member_id: seat.league_member_id,
    user_id: seat.user_id,
    nomination_id: chosen,
    made_at: nowPick,
    request_id: `auto-${reason.toLowerCase()}-${nowPick.getTime()}`
  });

  const newPickCount = picks.length + 1;
  const requiredPicks = resolveTotalRequiredPicks(draft, seatCount, picksPerSeat);
  let nextDraft = { ...draft };
  if (requiredPicks > 0 && newPickCount >= requiredPicks) {
    const completed =
      (await completeDraftIfReady(tx, draft.id, nowPick, requiredPicks)) ??
      (await updateDraftOnComplete(tx, draft.id, nowPick));
    nextDraft = {
      ...nextDraft,
      status: completed?.status ?? "COMPLETED",
      completed_at: completed?.completed_at ?? nowPick,
      current_pick_number: null,
      total_picks: completed?.total_picks ?? draft.total_picks,
      pick_deadline_at: null,
      pick_timer_remaining_ms: null
    };
    await updateDraftTimer(tx, draft.id, null, null);
  } else {
    const nextPickNumber = currentPickNumber + 1;
    nextDraft = {
      ...nextDraft,
      current_pick_number: nextPickNumber,
      total_picks: draft.total_picks ?? requiredPicks
    };
    await updateDraftCurrentPick(tx, draft.id, nextPickNumber);
    const deadline = computeDeadline(nowPick, draft.pick_timer_seconds ?? null);
    await updateDraftTimer(tx, draft.id, deadline, null);
    nextDraft.pick_deadline_at = deadline;
  }

  const event = await createDraftEvent(tx, {
    draft_id: draft.id,
    event_type: "draft.pick.autopicked",
    payload: {
      reason,
      strategy,
      pick: {
        id: pick.id,
        draft_id: pick.draft_id,
        pick_number: pick.pick_number,
        round_number: pick.round_number,
        seat_number: pick.seat_number,
        league_member_id: pick.league_member_id,
        user_id: pick.user_id,
        nomination_id: pick.nomination_id,
        made_at: pick.made_at,
        request_id: pick.request_id ?? null
      },
      draft: {
        status: nextDraft.status,
        current_pick_number: nextDraft.current_pick_number,
        completed_at: nextDraft.completed_at ?? null,
        pick_deadline_at: nextDraft.pick_deadline_at ?? null
      }
    }
  });
  emitDraftEvent(event);

  if (nextDraft.status === "COMPLETED") {
    // Best-effort: recompute ceremony benchmark for wisdom-of-crowds.
    try {
      await recomputeWisdomBenchmarkForCeremonyTx({ tx, ceremonyId: season.ceremony_id });
    } catch {
      // best-effort; ignore
    }
  }

  return nextDraft;
}

async function autoPickIfExpired(options: {
  tx: DbClient;
  draft: DraftRecord;
  season: { id: number; ceremony_id: number };
  league: { roster_size: number | string | null };
}) {
  const { tx, draft, season, league } = options;
  if (draft.status !== "IN_PROGRESS") return draft;
  if (!draft.pick_deadline_at || draft.pick_timer_seconds === null) return draft;
  const deadlineMs = new Date(draft.pick_deadline_at).getTime();
  if (!Number.isFinite(deadlineMs)) return draft;
  if (Date.now() <= deadlineMs) return draft;

  return await autoPickOne({
    tx,
    draft,
    season,
    league,
    reason: "TIMER_EXPIRED",
    force: true
  });
}

const USER_AUTODRAFT_DELAY_MS = 1000;
const pendingUserAutodraft = new Map<
  number,
  { timeout: ReturnType<typeof setTimeout>; pickNumber: number }
>();

function scheduleUserAutodraft(args: {
  pool: Pool;
  draftId: number;
  pickNumber: number;
}) {
  const prior = pendingUserAutodraft.get(args.draftId);
  if (prior) clearTimeout(prior.timeout);

  const timeout = setTimeout(() => {
    // This timer is single-shot; if we schedule again it will set a new entry.
    pendingUserAutodraft.delete(args.draftId);
    void runInTransaction(args.pool, async (tx) => {
      const lockedDraft = await getDraftByIdForUpdate(tx, args.draftId);
      if (!lockedDraft) return;
      if (lockedDraft.status !== "IN_PROGRESS") return;
      // If the pick has advanced (manual pick or earlier auto-pick), do nothing.
      if ((lockedDraft.current_pick_number ?? null) !== args.pickNumber) return;

      const season = await getSeasonById(tx, lockedDraft.season_id);
      if (!season) return;
      const league = await getLeagueById(tx, season.league_id);
      if (!league) return;

      const seats = await listDraftSeats(tx, lockedDraft.id);
      const seatCount = seats.length;
      if (seatCount === 0) return;
      const currentPickNumber = lockedDraft.current_pick_number ?? null;
      if (!currentPickNumber) return;
      const assignment = computePickAssignment({
        draft_order_type: "SNAKE",
        seat_count: seatCount,
        pick_number: currentPickNumber,
        status: lockedDraft.status
      });
      const seat = seats.find((s) => s.seat_number === assignment.seat_number);
      if (!seat?.user_id) return;

      const userAuto = await getDraftAutodraftConfig(tx, {
        draft_id: lockedDraft.id,
        user_id: seat.user_id
      });
      if (!userAuto?.enabled) return;

      const next = await autoPickOne({
        tx,
        draft: lockedDraft,
        season,
        league,
        reason: "USER_AUTODRAFT",
        force: true
      });

      // If the draft is still live, schedule again for the next seat (if enabled).
      if (
        next.status === "IN_PROGRESS" &&
        next.current_pick_number &&
        next.current_pick_number !== args.pickNumber
      ) {
        scheduleUserAutodraft({
          pool: args.pool,
          draftId: args.draftId,
          pickNumber: next.current_pick_number
        });
      }
    }).catch(() => {});
  }, USER_AUTODRAFT_DELAY_MS);

  pendingUserAutodraft.set(args.draftId, { timeout, pickNumber: args.pickNumber });
}

async function runImmediateAutodraftIfEnabled(args: { pool: Pool; draftId: number }) {
  const { pool, draftId } = args;

  // Fast read in a transaction to determine whether we should schedule a delayed auto-pick.
  // We do *not* hold a transaction open for the delay.
  const pickNumber = await runInTransaction(pool, async (tx) => {
    const lockedDraft = await getDraftByIdForUpdate(tx, draftId);
    if (!lockedDraft) return null;
    if (lockedDraft.status !== "IN_PROGRESS") return null;
    const season = await getSeasonById(tx, lockedDraft.season_id);
    if (!season) return null;
    const league = await getLeagueById(tx, season.league_id);
    if (!league) return null;

    const seats = await listDraftSeats(tx, lockedDraft.id);
    const seatCount = seats.length;
    if (seatCount === 0) return null;
    const currentPickNumber = lockedDraft.current_pick_number ?? null;
    if (!currentPickNumber) return null;
    const assignment = computePickAssignment({
      draft_order_type: "SNAKE",
      seat_count: seatCount,
      pick_number: currentPickNumber,
      status: lockedDraft.status
    });
    const seat = seats.find((s) => s.seat_number === assignment.seat_number);
    if (!seat?.user_id) return null;

    const userAuto = await getDraftAutodraftConfig(tx, {
      draft_id: lockedDraft.id,
      user_id: seat.user_id
    });
    if (!userAuto?.enabled) return null;

    return currentPickNumber;
  });

  if (!pickNumber) return;
  scheduleUserAutodraft({ pool, draftId, pickNumber });
}

export function buildCreateDraftHandler(client: DbClient) {
  return async function handleCreateDraft(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const { league_id, draft_order_type, pick_timer_seconds } = req.body ?? {};
      const seasonIdRaw = (req.body ?? {}).season_id;

      const leagueIdNum = Number(league_id);
      if (!league_id || Number.isNaN(leagueIdNum)) {
        throw validationError("Missing or invalid league_id", ["league_id"]);
      }

      const order = (draft_order_type ?? "SNAKE").toUpperCase();
      if (order !== "SNAKE") {
        throw validationError("Invalid draft_order_type (MVP supports SNAKE only)", [
          "draft_order_type"
        ]);
      }
      if (
        pick_timer_seconds !== undefined &&
        pick_timer_seconds !== null &&
        (!Number.isFinite(Number(pick_timer_seconds)) || Number(pick_timer_seconds) < 0)
      ) {
        throw validationError("Invalid pick_timer_seconds", ["pick_timer_seconds"]);
      }
      const pickTimerSecondsNum =
        pick_timer_seconds === undefined || pick_timer_seconds === null
          ? null
          : Number(pick_timer_seconds);
      const autoPickStrategy =
        pickTimerSecondsNum && pickTimerSecondsNum > 0 ? "RANDOM_SEED" : null;

      const league = await getLeagueById(client, leagueIdNum);
      if (!league) {
        throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
      }

      // Create a draft for a specific season (supports leagues with multiple seasons/ceremonies).
      // A league can have multiple extant seasons (one per ceremony), so `season_id` is required.
      if (seasonIdRaw !== undefined && seasonIdRaw !== null) {
        const seasonIdNum = Number(seasonIdRaw);
        if (!Number.isFinite(seasonIdNum) || seasonIdNum <= 0) {
          throw validationError("Invalid season_id", ["season_id"]);
        }
        const season = await getSeasonById(client, seasonIdNum);
        if (!season || season.league_id !== leagueIdNum) {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }
        if (season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_ACTIVE", 409, "Season is not active");
        }

        const { rows: ceremonyRows } = await query<{
          status: string;
          draft_locked_at: Date | null;
        }>(client, `SELECT status, draft_locked_at FROM ceremony WHERE id = $1`, [
          season.ceremony_id
        ]);
        const ceremony = ceremonyRows[0];
        if (!ceremony) {
          throw new AppError("CEREMONY_NOT_FOUND", 404, "Ceremony not found");
        }
        const isLocked =
          ceremony.draft_locked_at != null ||
          String(ceremony.status).toUpperCase() === "LOCKED" ||
          String(ceremony.status).toUpperCase() === "ARCHIVED";
        if (isLocked) {
          throw new AppError("CEREMONY_LOCKED", 409, "Ceremony is locked");
        }
        if (String(ceremony.status).toUpperCase() !== "PUBLISHED") {
          throw new AppError("CEREMONY_NOT_PUBLISHED", 409, "Ceremony is not published");
        }

        const userId = Number((req as AuthedRequest).auth?.sub);
        const leagueMember = await getLeagueMember(client, leagueIdNum, userId);
        const isCommissioner =
          league.created_by_user_id === userId ||
          (leagueMember &&
            (leagueMember.role === "OWNER" || leagueMember.role === "CO_OWNER"));
        if (!isCommissioner) {
          throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
        }

        const existing = await getDraftBySeasonId(client, season.id);
        if (existing) {
          throw new AppError("DRAFT_EXISTS", 409, "Draft already exists for this season");
        }

        const draft = await createDraft(client, {
          league_id: leagueIdNum,
          season_id: season.id,
          status: "PENDING",
          draft_order_type: "SNAKE",
          current_pick_number: null,
          started_at: null,
          completed_at: null,
          remainder_strategy: season.remainder_strategy ?? "UNDRAFTED",
          pick_timer_seconds:
            pickTimerSecondsNum && pickTimerSecondsNum > 0
              ? Math.floor(pickTimerSecondsNum)
              : null,
          auto_pick_strategy: autoPickStrategy
        });

        return res.status(201).json({ draft });
      }
      throw validationError("Missing season_id", ["season_id"]);
    } catch (err) {
      next(err);
    }
  };
}

export function buildStartDraftHandler(pool: Pool) {
  return async function handleStartDraft(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const draftId = Number(req.params.id);
      if (Number.isNaN(draftId)) {
        throw validationError("Invalid draft id", ["id"]);
      }

      const userId = Number((req as AuthedRequest).auth?.sub);

      const result = await runInTransaction(pool, async (tx) => {
        const draft = await getDraftByIdForUpdate(tx, draftId);
        if (!draft) {
          throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");
        }

        const season = await getSeasonById(tx, draft.season_id);
        if (!season) {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }
        if (season.status === "CANCELLED") {
          throw new AppError("SEASON_CANCELLED", 409, "Season is cancelled");
        }
        if (season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }

        const league = await getLeagueById(tx, season.league_id);
        if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");

        // Multi-ceremony: drafting is scoped to the ceremony attached to this season.
        const lockedAt = await getCeremonyDraftLockedAt(tx, season.ceremony_id);
        if (lockedAt && !draft.allow_drafting_after_lock) {
          throw new AppError("DRAFT_LOCKED", 409, "Draft is locked after winners entry");
        }
        const isOverrideActive = Boolean(lockedAt) && draft.allow_drafting_after_lock;

        const leagueMember = await getLeagueMember(tx, league.id, userId);
        const seasonMember = await getSeasonMember(tx, season.id, userId);
        const isCommissioner =
          league.created_by_user_id === userId ||
          (leagueMember &&
            (leagueMember.role === "OWNER" || leagueMember.role === "CO_OWNER")) ||
          (seasonMember &&
            (seasonMember.role === "OWNER" || seasonMember.role === "CO_OWNER"));
        if (!isCommissioner) {
          throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
        }

        if (draft.status !== "PENDING") {
          throw new AppError("DRAFT_ALREADY_STARTED", 409, "Draft already started");
        }

        // Revoke any pending invites so seat creation reflects actual participants.
        await revokePendingInvitesForSeason(tx, season.id);

        let seatTotal = await countDraftSeats(tx, draftId);
        if (seatTotal === 0) {
          const members = await listSeasonMembers(tx, season.id);
          const leagueMemberIds = members
            .map((m) => m.league_member_id)
            .filter((id): id is number => typeof id === "number" && !Number.isNaN(id));
          const shuffled = leagueMemberIds.sort(() => Math.random() - 0.5);
          if (shuffled.length < 2) {
            throw new AppError(
              "NOT_ENOUGH_PARTICIPANTS",
              409,
              "At least 2 season participants are required to start the draft"
            );
          }
          await createDraftSeats(tx, {
            draft_id: draft.id,
            league_member_ids_in_order: shuffled
          });
          seatTotal = shuffled.length;
        }

        const nominationCount = await countNominationsByCeremony(tx, season.ceremony_id);
        if (nominationCount <= 0) {
          throw new AppError(
            "PREREQ_MISSING_NOMINATIONS",
            400,
            "No nominations loaded; load nominees before starting draft"
          );
        }
        const remainderStrategy: RemainderStrategy =
          (season.remainder_strategy as RemainderStrategy) ?? "UNDRAFTED";
        const picksPerSeat = Math.floor(nominationCount / seatTotal);
        if (picksPerSeat <= 0) {
          throw new AppError(
            "PREREQ_INSUFFICIENT_NOMINATIONS",
            400,
            "Not enough nominations for the number of participants"
          );
        }
        const now = new Date();
        const remainder = nominationCount - picksPerSeat * seatTotal;
        const totalPicks =
          remainderStrategy === "FULL_POOL" && remainder > 0
            ? nominationCount
            : seatTotal * picksPerSeat;
        const deadline = computeDeadline(now, draft.pick_timer_seconds ?? null);
        const transitioned = transitionDraftState(
          {
            id: draft.id,
            status: draft.status,
            started_at: draft.started_at,
            completed_at: draft.completed_at
          },
          "IN_PROGRESS",
          () => now
        );

        const updated = await updateDraftOnStart(
          tx,
          draft.id,
          draft.current_pick_number ?? 1,
          transitioned.started_at ?? now,
          picksPerSeat,
          remainderStrategy,
          totalPicks,
          draft.pick_timer_seconds ?? null,
          draft.auto_pick_strategy ?? null,
          deadline,
          null
        );
        if (!updated) {
          throw new AppError("INTERNAL_ERROR", 500, "Failed to start draft");
        }

        const event = await createDraftEvent(tx, {
          draft_id: draft.id,
          event_type: "draft.started",
          payload: {
            draft: {
              id: updated.id,
              status: updated.status,
              current_pick_number: updated.current_pick_number,
              picks_per_seat: updated.picks_per_seat,
              started_at: updated.started_at,
              completed_at: updated.completed_at,
              pick_deadline_at: updated.pick_deadline_at ?? deadline ?? null,
              allow_drafting_after_lock: updated.allow_drafting_after_lock,
              lock_override_set_by_user_id: updated.lock_override_set_by_user_id ?? null,
              lock_override_set_at: updated.lock_override_set_at ?? null,
              draft_locked_at: lockedAt ?? null,
              override_active: isOverrideActive
            }
          }
        });

        return { draft: { ...updated, version: event.version }, event };
      });

      emitDraftEvent(result.event);
      // If the next (or subsequent) seat has user-enabled auto-draft, schedule it.
      await runImmediateAutodraftIfEnabled({ pool, draftId: result.draft.id });
      return res.status(200).json({ draft: result.draft });
    } catch (err) {
      next(err);
    }
  };
}

function requireCommissionerOrOwner(
  userId: number,
  league: { created_by_user_id: number },
  leagueMember: { role: string } | null
) {
  return (
    league.created_by_user_id === userId ||
    (leagueMember && (leagueMember.role === "OWNER" || leagueMember.role === "CO_OWNER"))
  );
}

export function buildOverrideDraftLockHandler(pool: Pool) {
  return async function handleOverrideDraftLock(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const draftId = Number(req.params.id);
      if (Number.isNaN(draftId)) throw validationError("Invalid draft id", ["id"]);
      const allow = (req.body ?? {}).allow;
      if (typeof allow !== "boolean") {
        throw validationError("Invalid override flag", ["allow"]);
      }
      const userId = Number((req as AuthedRequest).auth?.sub);

      const result = await runInTransaction(pool, async (tx) => {
        const draft = await getDraftByIdForUpdate(tx, draftId);
        if (!draft) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");

        const season = await getSeasonById(tx, draft.season_id);
        if (!season) throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        if (season.status === "CANCELLED") {
          throw new AppError("SEASON_CANCELLED", 409, "Season is cancelled");
        }

        const league = await getLeagueById(tx, season.league_id);
        if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
        const leagueMember = await getLeagueMember(tx, league.id, userId);
        if (!requireCommissionerOrOwner(userId, league, leagueMember)) {
          throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
        }

        const updated = await setDraftLockOverride(tx, draftId, allow, userId);
        if (!updated) {
          throw new AppError("INTERNAL_ERROR", 500, "Failed to set override");
        }
        const lockedAt = await getCeremonyDraftLockedAt(tx, season.ceremony_id);
        const event = await createDraftEvent(tx, {
          draft_id: draftId,
          event_type: "draft.lock.override.set",
          payload: {
            allow,
            user_id: userId,
            ceremony_id: season.ceremony_id,
            locked_at: lockedAt ?? null,
            set_at: updated.lock_override_set_at ?? new Date()
          }
        });

        return { draft: { ...updated, version: event.version }, event };
      });

      emitDraftEvent(result.event);
      // If the current seat has user-enabled auto-draft, schedule it upon resume.
      await runImmediateAutodraftIfEnabled({ pool, draftId: result.draft.id });
      return res.status(200).json({ draft: result.draft });
    } catch (err) {
      next(err);
    }
  };
}

export function buildPauseDraftHandler(pool: Pool) {
  return async function handlePauseDraft(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const draftId = Number(req.params.id);
      if (Number.isNaN(draftId)) throw validationError("Invalid draft id", ["id"]);
      const userId = Number((req as AuthedRequest).auth?.sub);

      const result = await runInTransaction(pool, async (tx) => {
        const draft = await getDraftByIdForUpdate(tx, draftId);
        if (!draft) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");
        const season = await getSeasonById(tx, draft.season_id);
        if (!season || season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }
        const league = await getLeagueById(tx, season.league_id);
        if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
        // Multi-ceremony: drafting is scoped to the ceremony attached to this season.
        const leagueMember = await getLeagueMember(tx, league.id, userId);
        const isCommissioner = requireCommissionerOrOwner(userId, league, leagueMember);
        if (!isCommissioner) {
          throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
        }
        if (draft.status === "PAUSED") {
          throw new AppError("DRAFT_ALREADY_PAUSED", 409, "Draft already paused");
        }
        if (draft.status !== "IN_PROGRESS") {
          throw new AppError("DRAFT_NOT_IN_PROGRESS", 409, "Draft is not in progress");
        }

        let transitioned;
        try {
          transitioned = transitionDraftState(
            {
              id: draft.id,
              status: draft.status,
              started_at: draft.started_at,
              completed_at: draft.completed_at
            },
            "PAUSED"
          );
        } catch (err) {
          const mapped = mapDraftStateError(err);
          if (mapped) {
            throw new AppError("INVALID_STATE", 400, mapped.message);
          }
          throw err;
        }

        let updatedTimer = null;
        if (draft.pick_timer_seconds) {
          const deadline = draft.pick_deadline_at
            ? new Date(draft.pick_deadline_at)
            : null;
          const remainingMs =
            deadline && deadline.getTime() > Date.now()
              ? deadline.getTime() - Date.now()
              : 0;
          updatedTimer = await updateDraftTimer(tx, draft.id, null, remainingMs);
        }

        const updated = await updateDraftStatus(tx, draft.id, transitioned.status);
        if (!updated) throw new AppError("INTERNAL_ERROR", 500, "Failed to pause draft");
        const updatedDraft = {
          ...updated,
          pick_deadline_at: updatedTimer?.pick_deadline_at ?? draft.pick_deadline_at,
          pick_timer_remaining_ms:
            updatedTimer?.pick_timer_remaining_ms ?? draft.pick_timer_remaining_ms
        };

        const event = await createDraftEvent(tx, {
          draft_id: draft.id,
          event_type: "draft.paused",
          payload: {
            draft: {
              id: updatedDraft.id,
              status: updatedDraft.status,
              current_pick_number: updatedDraft.current_pick_number,
              started_at: updatedDraft.started_at,
              completed_at: updatedDraft.completed_at,
              pick_deadline_at: updatedDraft.pick_deadline_at
            }
          }
        });

        return { draft: { ...updatedDraft, version: event.version }, event };
      });

      emitDraftEvent(result.event);
      return res.status(200).json({ draft: result.draft });
    } catch (err) {
      next(err);
    }
  };
}

export function buildResumeDraftHandler(pool: Pool) {
  return async function handleResumeDraft(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const draftId = Number(req.params.id);
      if (Number.isNaN(draftId)) throw validationError("Invalid draft id", ["id"]);
      const userId = Number((req as AuthedRequest).auth?.sub);

      const result = await runInTransaction(pool, async (tx) => {
        const draft = await getDraftByIdForUpdate(tx, draftId);
        if (!draft) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");
        const season = await getSeasonById(tx, draft.season_id);
        if (!season || season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }
        const league = await getLeagueById(tx, season.league_id);
        if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
        // Multi-ceremony: drafting is scoped to the ceremony attached to this season.
        const leagueMember = await getLeagueMember(tx, league.id, userId);
        const isCommissioner = requireCommissionerOrOwner(userId, league, leagueMember);
        if (!isCommissioner) {
          throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
        }
        if (draft.status !== "PAUSED") {
          throw new AppError("DRAFT_NOT_PAUSED", 409, "Draft is not paused");
        }

        let transitioned;
        try {
          transitioned = transitionDraftState(
            {
              id: draft.id,
              status: draft.status,
              started_at: draft.started_at,
              completed_at: draft.completed_at
            },
            "IN_PROGRESS"
          );
        } catch (err) {
          const mapped = mapDraftStateError(err);
          if (mapped) {
            throw new AppError("INVALID_STATE", 400, mapped.message);
          }
          throw err;
        }

        let timerUpdated = null;
        if (draft.pick_timer_seconds) {
          const ms =
            draft.pick_timer_remaining_ms ??
            (draft.pick_timer_seconds ? draft.pick_timer_seconds * 1000 : null);
          const deadline =
            ms && ms > 0 ? new Date(Date.now() + ms) : (draft.pick_deadline_at ?? null);
          timerUpdated = await updateDraftTimer(tx, draft.id, deadline, null);
        }

        const updated = await updateDraftStatus(tx, draft.id, transitioned.status);
        if (!updated) throw new AppError("INTERNAL_ERROR", 500, "Failed to resume draft");
        const updatedDraft = {
          ...updated,
          pick_deadline_at: timerUpdated?.pick_deadline_at ?? draft.pick_deadline_at,
          pick_timer_remaining_ms: timerUpdated?.pick_timer_remaining_ms ?? null
        };

        const event = await createDraftEvent(tx, {
          draft_id: draft.id,
          event_type: "draft.resumed",
          payload: {
            draft: {
              id: updatedDraft.id,
              status: updatedDraft.status,
              current_pick_number: updatedDraft.current_pick_number,
              started_at: updatedDraft.started_at,
              completed_at: updatedDraft.completed_at,
              pick_deadline_at: updatedDraft.pick_deadline_at
            }
          }
        });

        return { draft: { ...updatedDraft, version: event.version }, event };
      });

      emitDraftEvent(result.event);
      return res.status(200).json({ draft: result.draft });
    } catch (err) {
      next(err);
    }
  };
}

export function buildSnapshotDraftHandler(pool: Pool) {
  return async function handleSnapshotDraft(
    req: AuthedRequest,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const draftId = Number(req.params.id);
      if (Number.isNaN(draftId)) {
        throw validationError("Invalid draft id", ["id"]);
      }

      await runInTransaction(pool, async (tx) => {
        const lockedDraft = await getDraftByIdForUpdate(tx, draftId);
        if (!lockedDraft) return;
        const season = await getSeasonById(tx, lockedDraft.season_id);
        const league = season ? await getLeagueById(tx, season.league_id) : null;
        if (!season || !league) return;
        await autoPickIfExpired({ tx, draft: lockedDraft, season, league });
      });
      // If the next seat has user-enabled auto-draft, schedule it (delayed) after any timer auto-pick.
      await runImmediateAutodraftIfEnabled({ pool, draftId });

      let draft = await getDraftById(pool, draftId);
      if (!draft) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");

      let seats = await listDraftSeats(pool, draftId);
      let picks = await listDraftPicks(pool, draftId);
      let completedEventEmitted = false;

      // If all required picks are made but status not updated, complete draft lazily.
      const league = await getLeagueById(pool, draft.league_id);
      const picksPerSeat = resolvePicksPerSeat(draft, league ?? { roster_size: 1 });
      if (draft.picks_per_seat === null || draft.picks_per_seat === undefined) {
        draft = { ...draft, picks_per_seat: picksPerSeat };
      }
      const totalRequired = resolveTotalRequiredPicks(draft, seats.length, picksPerSeat);
      if (draft.total_picks === null || draft.total_picks === undefined) {
        draft = { ...draft, total_picks: totalRequired };
      }
      if (
        totalRequired > 0 &&
        picks.length >= totalRequired &&
        draft.status !== "COMPLETED"
      ) {
        const result = await runInTransaction(pool, async (tx) => {
          const lockedDraft = await getDraftByIdForUpdate(tx, draftId);
          if (!lockedDraft) {
            throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");
          }
          const freshSeats = await listDraftSeats(tx, draftId);
          const freshPicks = await listDraftPicks(tx, draftId);
          const freshTotalRequired = resolveTotalRequiredPicks(
            lockedDraft,
            freshSeats.length,
            picksPerSeat
          );
          if (
            freshTotalRequired <= 0 ||
            freshPicks.length < freshTotalRequired ||
            lockedDraft.status === "COMPLETED"
          ) {
            return {
              draft: lockedDraft,
              seats: freshSeats,
              picks: freshPicks,
              event: null
            };
          }

          const completed = transitionDraftState(
            {
              id: lockedDraft.id,
              status: lockedDraft.status,
              started_at: lockedDraft.started_at,
              completed_at: lockedDraft.completed_at
            },
            "COMPLETED"
          );
          const updated =
            (await completeDraftIfReady(
              tx,
              lockedDraft.id,
              completed.completed_at ?? new Date(),
              freshTotalRequired
            )) ??
            (await updateDraftOnComplete(
              tx,
              lockedDraft.id,
              completed.completed_at ?? new Date()
            ));
          const nextDraft = {
            ...lockedDraft,
            status: updated?.status ?? completed.status,
            completed_at: updated?.completed_at ?? completed.completed_at,
            current_pick_number: null
          };
          return {
            draft: nextDraft,
            seats: freshSeats,
            picks: freshPicks,
            completed: true
          };
        });

        draft = result.draft;
        if (draft.picks_per_seat === null || draft.picks_per_seat === undefined) {
          draft = { ...draft, picks_per_seat: picksPerSeat };
        }
        seats = result.seats;
        picks = result.picks;
        if (result.completed) {
          completedEventEmitted = true;
        }
      }

      let nomineePoolSize: number | null = null;
      const season = await getSeasonById(pool, draft.season_id);
      if (season && season.status === "CANCELLED") {
        throw new AppError("SEASON_CANCELLED", 409, "Season cancelled");
      }
      if (season) {
        nomineePoolSize = await countNominationsByCeremony(pool, season.ceremony_id);
      }
      if (completedEventEmitted && season) {
        void recomputeWisdomBenchmarkForCeremony({
          pool,
          ceremonyId: season.ceremony_id
        }).catch(() => {});
      }

      // Pre-draft: seats don't exist yet (and seat order is intentionally secret). For display,
      // use the season membership roster so the header can render participants.
      if (draft.status === "PENDING" && seats.length === 0 && season) {
        const display = await query<{
          user_id: number;
          league_member_id: number | null;
          username: string;
          avatar_key: string | null;
        }>(
          pool,
          `
            SELECT
              sm.user_id::int,
              sm.league_member_id::int,
              u.username,
              u.avatar_key
            FROM season_member sm
            JOIN app_user u ON u.id = sm.user_id
            WHERE sm.season_id = $1
            ORDER BY lower(u.username) ASC, sm.joined_at ASC, sm.id ASC
          `,
          [season.id]
        );
        seats = display.rows.map((r, idx) => ({
          seat_number: idx + 1,
          league_member_id: r.league_member_id ?? 0,
          user_id: r.user_id,
          username: r.username,
          avatar_key: r.avatar_key ?? null
        })) as unknown as typeof seats;
      }

      const board = season
        ? await getDraftBoardForCeremony(pool, season.ceremony_id)
        : { categories: [], nominations: [] };
      const categories = board.categories;
      const nominations = board.nominations;
      const winners = season ? await listWinnersByCeremony(pool, season.ceremony_id) : [];
      const wisdomBenchmark = season
        ? await getWisdomBenchmarkForCeremony(pool, season.ceremony_id)
        : null;

      let turn: {
        current_pick_number: number;
        seat_number: number;
        round_number: number;
        direction: "FORWARD" | "REVERSE";
      } | null = null;
      if (
        (draft.status === "IN_PROGRESS" || draft.status === "PAUSED") &&
        draft.current_pick_number &&
        seats.length > 0
      ) {
        const assignment = computePickAssignment({
          draft_order_type: "SNAKE",
          seat_count: seats.length,
          pick_number: draft.current_pick_number,
          status: draft.status
        });
        const direction = assignment.round_number % 2 === 1 ? "FORWARD" : "REVERSE";
        turn = {
          current_pick_number: draft.current_pick_number,
          seat_number: assignment.seat_number,
          round_number: assignment.round_number,
          direction
        };
      }

      const viewerUserId = Number(req.auth?.sub);
      const mySeatNumber =
        viewerUserId && seats.length
          ? (seats.find((s) => Number(s.user_id) === viewerUserId)?.seat_number ?? null)
          : null;
      const viewerLeagueMember =
        viewerUserId && league
          ? await getLeagueMember(pool, league.id, viewerUserId)
          : null;
      const viewerSeasonMember =
        viewerUserId && season
          ? await getSeasonMember(pool, season.id, viewerUserId)
          : null;
      const canManageDraft = Boolean(
        viewerUserId &&
        league &&
        (league.created_by_user_id === viewerUserId ||
          ["OWNER", "CO_OWNER"].includes(String(viewerLeagueMember?.role ?? "")) ||
          ["OWNER", "CO_OWNER"].includes(String(viewerSeasonMember?.role ?? "")))
      );

      return res.status(200).json({
        draft,
        seats: seats.map((s) => ({
          seat_number: s.seat_number,
          league_member_id: s.league_member_id,
          user_id: s.user_id ?? null,
          username: (s as { username?: string }).username ?? null,
          avatar_key: (s as { avatar_key?: string | null }).avatar_key ?? null
        })),
        picks,
        version: draft.version,
        picks_per_seat: picksPerSeat,
        total_picks:
          draft.total_picks ??
          resolveTotalRequiredPicks(draft, seats.length, picksPerSeat),
        remainder_strategy:
          (draft as { remainder_strategy?: RemainderStrategy }).remainder_strategy ??
          "UNDRAFTED",
        auto_pick_strategy: draft.auto_pick_strategy ?? null,
        pick_timer_seconds: draft.pick_timer_seconds ?? null,
        pick_deadline_at: draft.pick_deadline_at ?? null,
        pick_timer_remaining_ms: draft.pick_timer_remaining_ms ?? null,
        nominee_pool_size: nomineePoolSize,
        turn,
        ceremony_id: season?.ceremony_id ?? null,
        ceremony_starts_at: season?.ceremony_starts_at ?? null,
        ceremony_status:
          (season as { ceremony_status?: string | null } | null)?.ceremony_status ?? null,
        scoring_strategy_name:
          (season as { scoring_strategy_name?: string | null } | null)
            ?.scoring_strategy_name ?? null,
        category_weights:
          (season as { category_weights?: unknown } | null)?.category_weights ?? null,
        wisdom_benchmark: wisdomBenchmark,
        my_seat_number: mySeatNumber,
        can_manage_draft: canManageDraft,
        categories,
        nominations,
        winners
      });
    } catch (err) {
      next(err);
    }
  };
}

export function buildSubmitPickHandler(pool: Pool) {
  return async function handleSubmitPick(
    req: AuthedRequest,
    res: express.Response,
    next: express.NextFunction
  ) {
    let requestId: string | null = null;
    let draftId: number | null = null;
    try {
      draftId = Number(req.params.id);
      if (Number.isNaN(draftId)) {
        throw validationError("Invalid draft id", ["id"]);
      }
      const draftIdNum = draftId;

      const { nomination_id, request_id } = req.body ?? {};
      const userId = Number(req.auth?.sub);
      if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
      if (!nomination_id) {
        throw validationError("Missing nomination_id", ["nomination_id"]);
      }
      const nominationIdNum = Number(nomination_id);
      if (Number.isNaN(nominationIdNum)) {
        throw validationError("Invalid nomination_id", ["nomination_id"]);
      }
      requestId = String(request_id ?? "").trim();
      if (!requestId) {
        throw validationError("Missing request_id", ["request_id"]);
      }
      if (requestId.length > 128) {
        throw validationError("request_id too long", ["request_id"]);
      }
      const requestIdVal = requestId;

      const rateKey = `${draftIdNum}:${userId}`;
      if (!pickRateLimiter.allow(rateKey)) {
        throw new AppError("RATE_LIMITED", 429, "Too many pick attempts; slow down.");
      }

      // Idempotent repeat is allowed even if the draft has since completed.
      const priorOutside = await getPickByRequestId(pool, draftIdNum, requestIdVal);
      if (priorOutside) {
        return res.status(200).json({ pick: priorOutside });
      }

      const result = await runInTransaction(pool, async (tx) => {
        // Idempotency: if this request_id already succeeded, return the same pick.
        const prior = await getPickByRequestId(tx, draftIdNum, requestIdVal);
        if (prior) {
          return { pick: prior, reused: true };
        }

        const draft = await getDraftByIdForUpdate(tx, draftIdNum);
        if (!draft) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");
        if (draft.status === "PAUSED") {
          throw new AppError("DRAFT_PAUSED", 409, "Draft is paused");
        }
        if (draft.status !== "IN_PROGRESS") {
          throw new AppError("DRAFT_NOT_IN_PROGRESS", 409, "Draft is not in progress");
        }

        const season = await getSeasonById(tx, draft.season_id);
        if (!season) {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }
        if (season.status === "CANCELLED") {
          throw new AppError("SEASON_CANCELLED", 409, "Season is cancelled");
        }
        if (season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }

        const league = await getLeagueById(tx, season.league_id);
        if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");

        // Multi-ceremony: drafting is scoped to the ceremony attached to this season.
        const lockedAt = await getCeremonyDraftLockedAt(tx, season.ceremony_id);
        if (lockedAt && !draft.allow_drafting_after_lock) {
          throw new AppError("DRAFT_LOCKED", 409, "Draft is locked after winners entry");
        }

        const seats = await listDraftSeats(tx, draftIdNum);
        const seatCount = seats.length;
        if (seatCount === 0) {
          throw new AppError("PREREQ_MISSING_SEATS", 400, "No draft seats configured");
        }

        // Auto-pick if timer expired before validating turn.
        const draftAfterTimer = await autoPickIfExpired({
          tx,
          draft,
          season,
          league
        });
        draft.status = draftAfterTimer.status;
        draft.current_pick_number = draftAfterTimer.current_pick_number;
        draft.completed_at = draftAfterTimer.completed_at;
        draft.pick_deadline_at = draftAfterTimer.pick_deadline_at;

        if (draft.status !== "IN_PROGRESS") {
          throw new AppError("DRAFT_NOT_IN_PROGRESS", 409, "Draft is not in progress");
        }

        const picksPerSeat = resolvePicksPerSeat(draft, league);
        const totalRequiredPicks = resolveTotalRequiredPicks(
          draft,
          seatCount,
          picksPerSeat
        );
        const existingPickCount = await countDraftPicks(tx, draftIdNum);
        const draftCurrent = draft.current_pick_number ?? 0;
        const currentPick = Math.max(
          existingPickCount + 1,
          draftCurrent || existingPickCount + 1
        );
        if (existingPickCount >= totalRequiredPicks) {
          throw new AppError("DRAFT_NOT_IN_PROGRESS", 409, "Draft is completed");
        }

        const nomination = await getNominationByIdForCeremony(
          tx,
          nominationIdNum,
          season.ceremony_id
        );
        if (!nomination) {
          throw new AppError("NOMINATION_NOT_FOUND", 404, "Nomination not found");
        }

        const existingNom = await getPickByNomination(tx, draftIdNum, nominationIdNum);
        if (existingNom) {
          // If the same logical request already picked this nomination, treat as idempotent.
          if (existingNom.request_id && existingNom.request_id === requestIdVal) {
            return { pick: existingNom, reused: true };
          }
          throw new AppError(
            "NOMINATION_ALREADY_PICKED",
            409,
            "Nomination already picked"
          );
        }

        const assignment = computePickAssignment({
          draft_order_type: "SNAKE",
          seat_count: seatCount,
          pick_number: currentPick,
          status: draft.status
        });

        const expectedSeat = seats.find((s) => s.seat_number === assignment.seat_number);
        if (!expectedSeat) {
          throw new AppError("TURN_RESOLUTION_ERROR", 500, "Seat not found for turn");
        }

        // If this is the final required pick, allow it to proceed even if the in-memory
        // turn resolver drifted (prevents getting stuck on completion edge cases).
        const isFinalRequiredPick =
          totalRequiredPicks > 0 && currentPick >= totalRequiredPicks;
        const userSeat = await getDraftSeatForUser(tx, draftIdNum, userId);
        if (!isFinalRequiredPick) {
          if (!userSeat || userSeat.seat_number !== assignment.seat_number) {
            const priorPick = await getPickByRequestId(tx, draftIdNum, requestIdVal);
            if (priorPick) return { pick: priorPick, reused: true };
            throw new AppError("NOT_ACTIVE_TURN", 409, "It is not your turn");
          }
        } else if (!userSeat) {
          const priorPick = await getPickByRequestId(tx, draftIdNum, requestIdVal);
          if (priorPick) return { pick: priorPick, reused: true };
          throw new AppError("NOT_ACTIVE_TURN", 409, "It is not your turn");
        }

        const seatNumberForPick =
          isFinalRequiredPick && userSeat ? userSeat.seat_number : assignment.seat_number;
        const seatForInsert =
          seats.find((s) => s.seat_number === seatNumberForPick) ?? expectedSeat;

        const now = new Date();
        let pick: DraftPickRecord;
        try {
          pick = await insertDraftPickRecord(tx, {
            draft_id: draftIdNum,
            pick_number: currentPick,
            round_number: assignment.round_number,
            seat_number: seatNumberForPick,
            league_member_id: seatForInsert.league_member_id,
            user_id: userId,
            nomination_id: nominationIdNum,
            made_at: now,
            request_id: requestIdVal
          });
        } catch (err: unknown) {
          const pgCode =
            err && typeof err === "object" && "code" in err
              ? (err as { code?: string }).code
              : undefined;
          if (pgCode === "23505") {
            const priorPick = await getPickByRequestId(tx, draftIdNum, requestIdVal);
            if (priorPick) {
              return { pick: priorPick, reused: true };
            }
            const pickByNumber = await getPickByNumber(tx, draftIdNum, currentPick);
            if (pickByNumber) {
              throw new AppError("NOT_ACTIVE_TURN", 409, "It is not your turn");
            }
            const pickByNomination = await getPickByNomination(
              tx,
              draftIdNum,
              nominationIdNum
            );
            if (pickByNomination) {
              throw new AppError(
                "NOMINATION_ALREADY_PICKED",
                409,
                "Nomination already picked"
              );
            }
          }
          throw err;
        }

        // Complete immediately when this pick satisfies the total required picks.
        const newPickCount = existingPickCount + 1;
        // Recompute seat count defensively in case earlier read was stale.
        const seatTotal = await countDraftSeats(tx, draftIdNum);
        const requiredPicks = resolveTotalRequiredPicks(draft, seatTotal, picksPerSeat);
        if (requiredPicks > 0 && newPickCount >= requiredPicks) {
          const updated =
            (await completeDraftIfReady(tx, draftIdNum, now, requiredPicks)) ??
            (await updateDraftOnComplete(tx, draftIdNum, now));
          if (!updated) {
            throw new AppError("INTERNAL_ERROR", 500, "Failed to complete draft");
          }
          const completedDraft = transitionDraftState(
            {
              id: draft.id,
              status: draft.status,
              started_at: draft.started_at,
              completed_at: draft.completed_at
            },
            "COMPLETED",
            () => now
          );
          // Keep in-memory draft aligned for rest of handler (though not reused here)
          draft.status = "COMPLETED";
          draft.completed_at = updated.completed_at ?? completedDraft.completed_at ?? now;
          draft.current_pick_number = null;
          await updateDraftTimer(tx, draftIdNum, null, null);
        } else {
          const nextPickNumber = newPickCount + 1;
          await updateDraftCurrentPick(tx, draftIdNum, nextPickNumber);
          draft.current_pick_number = nextPickNumber;
          const deadline = computeDeadline(now, draft.pick_timer_seconds ?? null);
          await updateDraftTimer(tx, draftIdNum, deadline, null);
          draft.pick_deadline_at = deadline;
        }

        const event = await createDraftEvent(tx, {
          draft_id: draftIdNum,
          event_type: "draft.pick.submitted",
          payload: {
            pick: {
              id: pick.id,
              draft_id: pick.draft_id,
              pick_number: pick.pick_number,
              round_number: pick.round_number,
              seat_number: pick.seat_number,
              league_member_id: pick.league_member_id,
              user_id: pick.user_id,
              nomination_id: pick.nomination_id,
              made_at: pick.made_at,
              request_id: pick.request_id ?? null
            },
            draft: {
              status: draft.status,
              current_pick_number: draft.current_pick_number,
              completed_at: draft.completed_at ?? null,
              pick_deadline_at: draft.pick_deadline_at ?? null
            }
          }
        });
        return {
          pick,
          reused: false,
          event,
          completed: draft.status === "COMPLETED",
          ceremonyId: season.ceremony_id
        };
      });

      const status = result?.reused ? 200 : 201;
      if (result?.event) {
        emitDraftEvent(result.event);
      }
      if (result?.completed) {
        void recomputeWisdomBenchmarkForCeremony({
          pool,
          ceremonyId: result.ceremonyId
        }).catch(() => {});
      }
      // If the next (or subsequent) seat has user-enabled auto-draft, schedule it.
      await runImmediateAutodraftIfEnabled({ pool, draftId: draftIdNum });
      return res.status(status).json({ pick: result.pick });
    } catch (err) {
      if (draftId !== null && requestId) {
        try {
          const prior = await getPickByRequestId(pool, draftId, requestId);
          if (prior) {
            return res.status(200).json({ pick: prior });
          }
        } catch {
          // fall through to error handler
        }
      }
      next(err);
    }
  };
}

export function buildExportDraftHandler(pool: Pool) {
  return buildExportDraftHandlerImpl(pool);
}

export function buildDraftResultsHandler(pool: Pool) {
  return buildDraftResultsHandlerImpl(pool);
}

export function buildDraftStandingsHandler(pool: Pool) {
  return buildDraftStandingsHandlerImpl(pool);
}

export async function tickDraft(pool: Pool, draftId: number) {
  const updated = await runInTransaction(pool, async (tx) => {
    const lockedDraft = await getDraftByIdForUpdate(tx, draftId);
    if (!lockedDraft) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");

    const season = await getSeasonById(tx, lockedDraft.season_id);
    if (!season) throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");

    const league = await getLeagueById(tx, season.league_id);
    if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");

    // If a pick timer is enabled, this can auto-pick when the deadline has passed.
    return await autoPickIfExpired({ tx, draft: lockedDraft, season, league });
  });
  // If the next (or subsequent) seat has user-enabled auto-draft, schedule it.
  // This keeps auto-picks paced even when driven by timer tick endpoints.
  await runImmediateAutodraftIfEnabled({ pool, draftId });
  return updated;
}

export function buildTickDraftHandler(pool: Pool) {
  return async function handleTickDraft(
    req: AuthedRequest,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const draftId = Number(req.params.id);
      if (Number.isNaN(draftId)) {
        throw validationError("Invalid draft id", ["id"]);
      }

      const updatedDraft = await tickDraft(pool, draftId);

      return res.status(200).json({
        draft: {
          id: updatedDraft.id,
          status: updatedDraft.status,
          current_pick_number: updatedDraft.current_pick_number ?? null,
          pick_deadline_at: updatedDraft.pick_deadline_at ?? null,
          pick_timer_seconds: updatedDraft.pick_timer_seconds ?? null
        }
      });
    } catch (err) {
      next(err);
    }
  };
}

export function createDraftsRouter(client: DbClient, authSecret: string): Router {
  const router = express.Router();

  router.use(requireAuth(authSecret));
  router.post("/", buildCreateDraftHandler(client));
  router.post("/:id/start", buildStartDraftHandler(client as Pool));
  router.post("/:id/override-lock", buildOverrideDraftLockHandler(client as Pool));
  router.post("/:id/pause", buildPauseDraftHandler(client as Pool));
  router.post("/:id/resume", buildResumeDraftHandler(client as Pool));
  router.post("/:id/tick", buildTickDraftHandler(client as Pool));
  router.get("/:id/snapshot", buildSnapshotDraftHandler(client as Pool));
  router.get("/:id/export", buildExportDraftHandler(client as Pool));
  router.post("/:id/results", buildDraftResultsHandler(client as Pool));
  router.get("/:id/standings", buildDraftStandingsHandler(client as Pool));
  router.post("/:id/picks", buildSubmitPickHandler(client as unknown as Pool));

  // Per-user auto-draft preferences for this draft.
  router.get("/:id/autodraft", async (req: AuthedRequest, res, next) => {
    try {
      const draftId = Number(req.params.id);
      if (Number.isNaN(draftId)) {
        throw validationError("Invalid draft id", ["id"]);
      }
      const userId = Number(req.auth?.sub);
      if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

      const draft = await getDraftById(client, draftId);
      if (!draft) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");
      const season = await getSeasonById(client, draft.season_id);
      if (!season) throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
      const membership = await getSeasonMember(client, season.id, userId);
      if (!membership) throw new AppError("FORBIDDEN", 403, "Not a season member");

      const cfg = (await getDraftAutodraftConfig(client, {
        draft_id: draftId,
        user_id: userId
      })) ?? { enabled: false, strategy: "RANDOM" as const, plan_id: null };

      return res.status(200).json({ autodraft: cfg });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/autodraft", async (req: AuthedRequest, res, next) => {
    try {
      const draftId = Number(req.params.id);
      if (Number.isNaN(draftId)) {
        throw validationError("Invalid draft id", ["id"]);
      }
      const userId = Number(req.auth?.sub);
      if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

      const enabled = Boolean(req.body?.enabled);
      const strategyRaw = String(req.body?.strategy ?? "RANDOM").toUpperCase();
      if (
        strategyRaw !== "RANDOM" &&
        strategyRaw !== "PLAN" &&
        strategyRaw !== "BY_CATEGORY" &&
        strategyRaw !== "ALPHABETICAL" &&
        strategyRaw !== "WISDOM"
      ) {
        throw validationError("Invalid strategy", ["strategy"]);
      }
      const strategy = strategyRaw as
        | "RANDOM"
        | "PLAN"
        | "BY_CATEGORY"
        | "ALPHABETICAL"
        | "WISDOM";
      const planIdRaw = req.body?.plan_id;
      const planId =
        planIdRaw === null || planIdRaw === undefined || planIdRaw === ""
          ? null
          : Number(planIdRaw);
      if (planId !== null && (!Number.isFinite(planId) || planId <= 0)) {
        throw validationError("Invalid plan_id", ["plan_id"]);
      }

      const result = await runInTransaction(client as Pool, async (tx) => {
        const draft = await getDraftByIdForUpdate(tx, draftId);
        if (!draft) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");
        if (draft.status === "COMPLETED") {
          throw new AppError(
            "DRAFT_SETTINGS_LOCKED",
            409,
            "Auto-draft settings are locked once the draft completes"
          );
        }

        const season = await getSeasonById(tx, draft.season_id);
        if (!season) throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        const membership = await getSeasonMember(tx, season.id, userId);
        if (!membership) throw new AppError("FORBIDDEN", 403, "Not a season member");

        let resolvedPlanId = enabled && strategy === "PLAN" ? planId : null;
        if (resolvedPlanId) {
          // Validate the plan belongs to this user and ceremony.
          const { rows } = await query<{ id: number }>(
            tx,
            `SELECT id::int FROM draft_plan WHERE id = $1 AND user_id = $2 AND ceremony_id = $3`,
            [resolvedPlanId, userId, season.ceremony_id]
          );
          if (!rows[0]) {
            throw new AppError("NOT_FOUND", 404, "Draft plan not found");
          }
        }

        const cfg = await upsertDraftAutodraftConfig(tx, {
          draft_id: draftId,
          user_id: userId,
          enabled,
          strategy,
          plan_id: resolvedPlanId
        });

        return cfg;
      });

      if (result.enabled) {
        // If the current seat user enables auto-draft, schedule it (no timer wait).
        await runImmediateAutodraftIfEnabled({ pool: client as Pool, draftId });
      }
      return res.status(200).json({ autodraft: result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
