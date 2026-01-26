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
  listNominationIds,
  completeDraftIfReady,
  createDraftEvent,
  upsertDraftResults,
  updateDraftTimer,
  setDraftLockOverride
} from "../data/repositories/draftRepository.js";
import {
  listNominationsForCeremony,
  getNominationWithStatus
} from "../data/repositories/nominationRepository.js";
import type {
  DraftPickRecord,
  DraftRecord
} from "../data/repositories/draftRepository.js";
import {
  getLeagueById,
  getLeagueMember,
  getDraftSeatForUser,
  setLeagueCeremonyIdIfMissing
} from "../data/repositories/leagueRepository.js";
import {
  createExtantSeason,
  getExtantSeasonForLeagueCeremony,
  getSeasonById
} from "../data/repositories/seasonRepository.js";
import { getCeremonyDraftLockedAt } from "../data/repositories/ceremonyRepository.js";
import { listSeasonMembers } from "../data/repositories/seasonMemberRepository.js";
import { getActiveCeremonyId } from "../data/repositories/appConfigRepository.js";
import type { DbClient } from "../data/db.js";
import { query, runInTransaction } from "../data/db.js";
import { mapDraftStateError, transitionDraftState } from "../domain/draftState.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { computePickAssignment } from "../domain/draftOrder.js";
import { revokePendingInvitesForSeason } from "../data/repositories/seasonInviteRepository.js";
import { listWinnersByCeremony } from "../data/repositories/winnerRepository.js";
import type { Pool } from "pg";
import { SlidingWindowRateLimiter } from "../utils/rateLimiter.js";
import { emitDraftEvent } from "../realtime/draftEvents.js";
import { scoreDraft } from "../domain/scoring.js";

const pickRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 2000,
  max: 3
});

type RemainderStrategy = "UNDRAFTED" | "FULL_POOL";

function resolvePicksPerSeat(
  draft: { picks_per_seat: number | null },
  league: { roster_size: number | string | null }
) {
  const rosterSizeRaw = Number(league?.roster_size);
  const fallback =
    Number.isFinite(rosterSizeRaw) && rosterSizeRaw > 0 ? rosterSizeRaw : 1;
  if (draft.picks_per_seat === null || draft.picks_per_seat === undefined)
    return fallback;
  return draft.picks_per_seat > 0 ? draft.picks_per_seat : fallback;
}

function resolveTotalRequiredPicks(
  draft: { total_picks?: number | null },
  seatCount: number,
  picksPerSeat: number
) {
  if (draft.total_picks !== null && draft.total_picks !== undefined) {
    return draft.total_picks;
  }
  return seatCount * picksPerSeat;
}

function normalizeTitle(raw: string | null | undefined): string {
  if (!raw) return "";
  const normalized = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return normalized.replace(/^(the|a|an)\s+/i, "").trim();
}

function createSeededRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i);
    h |= 0;
  }
  return () => {
    h = Math.imul(48271, h) % 0x7fffffff;
    const result = h / 0x7fffffff;
    return result < 0 ? result * -1 : result;
  };
}

type Strategy =
  | "NEXT_AVAILABLE"
  | "RANDOM_SEED"
  | "ALPHABETICAL"
  | "CANONICAL"
  | "SMART"
  | "CUSTOM_USER";

function resolveStrategy(
  strategy: DraftRecord["auto_pick_strategy"] | null | undefined
): Strategy {
  if (
    strategy === "RANDOM_SEED" ||
    strategy === "ALPHABETICAL" ||
    strategy === "CANONICAL" ||
    strategy === "SMART" ||
    strategy === "CUSTOM_USER"
  ) {
    return strategy;
  }
  return "NEXT_AVAILABLE";
}

type AutoPickConfig = {
  canonical_order?: number[];
  custom_rankings?: Record<string, number[]>;
  smart_priorities?: number[];
  alphabetical_field?: "film_title" | "song_title" | "performer_name";
};

function chooseAlphabetical(
  available: Awaited<ReturnType<typeof listNominationsForCeremony>>,
  field: AutoPickConfig["alphabetical_field"]
) {
  return [...available]
    .sort((a, b) => {
      const fieldAValue = field ? (a as Record<string, unknown>)[field] : null;
      const fieldBValue = field ? (b as Record<string, unknown>)[field] : null;
      const fieldA =
        (typeof fieldAValue === "string" ? fieldAValue : null) ??
        a.film_title ??
        a.song_title ??
        a.performer_name ??
        "";
      const fieldB =
        (typeof fieldBValue === "string" ? fieldBValue : null) ??
        b.film_title ??
        b.song_title ??
        b.performer_name ??
        "";
      const nameA = normalizeTitle(fieldA);
      const nameB = normalizeTitle(fieldB);
      if (nameA === nameB) return a.id - b.id;
      return nameA.localeCompare(nameB);
    })
    .map((n) => n.id)[0];
}

function chooseRandomized(
  availableIds: number[],
  seed: string | null | undefined
): { id: number | undefined; seed: string } {
  const resolvedSeed = seed ?? "draft-random-default";
  const rand = createSeededRandom(resolvedSeed);
  const ids = [...availableIds];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return { id: ids[0], seed: resolvedSeed };
}

function chooseCanonical(
  availableIds: number[],
  config: AutoPickConfig | null | undefined
) {
  const order = config?.canonical_order ?? [];
  if (Array.isArray(order) && order.length > 0) {
    const next = order.find((id) => availableIds.includes(id));
    if (next) return next;
  }
  return undefined;
}

function chooseCustomUser(
  userId: number,
  availableIds: number[],
  config: AutoPickConfig | null | undefined
) {
  const rankings = config?.custom_rankings ?? {};
  const userList = rankings[String(userId)] ?? rankings[userId] ?? [];
  const match = userList.find((id) => availableIds.includes(id));
  return match ?? undefined;
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
  const now = new Date();
  if (now <= new Date(draft.pick_deadline_at)) return draft;

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

  const strategy = resolveStrategy(draft.auto_pick_strategy);
  const availableIds = available.map((n) => n.id);

  let chosen: number | undefined;
  let seedUsed = draft.auto_pick_seed ?? null;

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
      chosen = availableIds.sort((a, b) => a - b)[0];
      break;
  }

  if (!chosen) {
    chosen = availableIds.sort((a, b) => a - b)[0];
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
    request_id: `auto-${nowPick.getTime()}`
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
      reason: "TIMER_EXPIRED",
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

  return nextDraft;
}

function computeDeadline(
  now: Date,
  pickTimerSeconds: number | null | undefined,
  overrideMs?: number | null
): Date | null {
  if (pickTimerSeconds === null || pickTimerSeconds === undefined) return null;
  const ms = overrideMs ?? pickTimerSeconds * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(now.getTime() + ms);
}

export function buildCreateDraftHandler(client: DbClient) {
  return async function handleCreateDraft(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const { league_id, draft_order_type, pick_timer_seconds, auto_pick_strategy } =
        req.body ?? {};
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
      const autoPick =
        auto_pick_strategy && auto_pick_strategy !== "NEXT_AVAILABLE"
          ? null
          : (auto_pick_strategy ?? null);

      const league = await getLeagueById(client, leagueIdNum);
      if (!league) {
        throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
      }

      // Newer flow: create a draft for a specific season (supports leagues with multiple seasons).
      // Back-compat: if season_id is omitted, we fall back to the legacy "active ceremony" flow.
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
            pick_timer_seconds === undefined || pick_timer_seconds === null
              ? null
              : Number(pick_timer_seconds),
          auto_pick_strategy: autoPick === "NEXT_AVAILABLE" ? "NEXT_AVAILABLE" : null
        });

        return res.status(201).json({ draft });
      }

      const activeCeremonyId = await getActiveCeremonyId(client);
      if (!activeCeremonyId) {
        throw new AppError(
          "ACTIVE_CEREMONY_NOT_SET",
          409,
          "Active ceremony is not configured"
        );
      }
      const activeCeremonyIdNum = Number(activeCeremonyId);
      if (Number.isNaN(activeCeremonyIdNum)) {
        throw new AppError("INTERNAL_ERROR", 500, "Invalid active ceremony id");
      }

      const ceremonyIdToUse =
        league.ceremony_id == null
          ? ((
              await setLeagueCeremonyIdIfMissing(client, leagueIdNum, activeCeremonyIdNum)
            )?.ceremony_id ?? activeCeremonyIdNum)
          : league.ceremony_id;

      if (ceremonyIdToUse !== activeCeremonyIdNum) {
        throw new AppError(
          "CEREMONY_INACTIVE",
          409,
          "Drafts can only be created for the active ceremony"
        );
      }

      const season =
        (await getExtantSeasonForLeagueCeremony(client, leagueIdNum, ceremonyIdToUse)) ??
        (await createExtantSeason(client, {
          league_id: leagueIdNum,
          ceremony_id: ceremonyIdToUse
        }));

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
          pick_timer_seconds === undefined || pick_timer_seconds === null
            ? null
            : Number(pick_timer_seconds),
        auto_pick_strategy: autoPick === "NEXT_AVAILABLE" ? "NEXT_AVAILABLE" : null
      });

      return res.status(201).json({ draft });
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

        const activeCeremonyId = await getActiveCeremonyId(tx);
        if (!activeCeremonyId) {
          throw new AppError(
            "ACTIVE_CEREMONY_NOT_SET",
            409,
            "Active ceremony is not configured"
          );
        }
        if (Number(season.ceremony_id) !== Number(activeCeremonyId)) {
          throw new AppError(
            "CEREMONY_INACTIVE",
            409,
            "Draft actions are limited to the active ceremony"
          );
        }
        const lockedAt = await getCeremonyDraftLockedAt(tx, season.ceremony_id);
        if (lockedAt && !draft.allow_drafting_after_lock) {
          throw new AppError("DRAFT_LOCKED", 409, "Draft is locked after winners entry");
        }
        const isOverrideActive = Boolean(lockedAt) && draft.allow_drafting_after_lock;

        const leagueMember = await getLeagueMember(tx, league.id, userId);
        const isCommissioner =
          league.created_by_user_id === userId ||
          (leagueMember &&
            (leagueMember.role === "OWNER" || leagueMember.role === "CO_OWNER"));
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
        const activeCeremonyId = await getActiveCeremonyId(tx);
        if (
          !activeCeremonyId ||
          Number(season.ceremony_id) !== Number(activeCeremonyId)
        ) {
          throw new AppError(
            "CEREMONY_INACTIVE",
            409,
            "Draft actions are limited to the active ceremony"
          );
        }
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
        const activeCeremonyId = await getActiveCeremonyId(tx);
        if (
          !activeCeremonyId ||
          Number(season.ceremony_id) !== Number(activeCeremonyId)
        ) {
          throw new AppError(
            "CEREMONY_INACTIVE",
            409,
            "Draft actions are limited to the active ceremony"
          );
        }
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

      let draft = await getDraftById(pool, draftId);
      if (!draft) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");

      let seats = await listDraftSeats(pool, draftId);
      let picks = await listDraftPicks(pool, draftId);

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
          const event = await createDraftEvent(tx, {
            draft_id: lockedDraft.id,
            event_type: "draft.completed",
            payload: {
              draft: {
                id: nextDraft.id,
                status: nextDraft.status,
                current_pick_number: nextDraft.current_pick_number,
                picks_per_seat: picksPerSeat,
                started_at: nextDraft.started_at,
                completed_at: nextDraft.completed_at
              }
            }
          });

          return { draft: nextDraft, seats: freshSeats, picks: freshPicks, event };
        });

        draft = result.draft;
        if (draft.picks_per_seat === null || draft.picks_per_seat === undefined) {
          draft = { ...draft, picks_per_seat: picksPerSeat };
        }
        seats = result.seats;
        picks = result.picks;
        if (result.event) {
          draft.version = result.event.version;
          emitDraftEvent(result.event);
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

      const categories = season
        ? (
            await query<{
              id: number;
              unit_kind: string;
              sort_index: number;
              family_name: string;
              icon_code: string | null;
            }>(
              pool,
              `SELECT
                 ce.id::int,
                 ce.unit_kind,
                 ce.sort_index::int,
                 cf.name AS family_name,
                 i.code AS icon_code
               FROM category_edition ce
               JOIN category_family cf ON cf.id = ce.family_id
               LEFT JOIN icon i ON i.id = COALESCE(ce.icon_id, cf.icon_id)
               WHERE ce.ceremony_id = $1
               ORDER BY ce.sort_index ASC, ce.id ASC`,
              [season.ceremony_id]
            )
          ).rows
        : [];

      const unitKindByCategoryId = new Map<number, string>();
      for (const c of categories) {
        unitKindByCategoryId.set(Number(c.id), String(c.unit_kind));
      }

      const nominations = season
        ? (await listNominationsForCeremony(pool, season.ceremony_id)).map((n) => {
            // Draft room display label should follow the category's unit kind, not
            // incidental contributor data (e.g. producers attached to Best Picture).
            const kind = unitKindByCategoryId.get(Number(n.category_edition_id)) ?? "";
            const label =
              kind === "SONG"
                ? (n.song_title ?? n.film_title ?? `Nomination #${n.id}`)
                : kind === "PERFORMANCE"
                  ? (n.performer_name ??
                    n.song_title ??
                    n.film_title ??
                    `Nomination #${n.id}`)
                  : (n.film_title ??
                    n.song_title ??
                    n.performer_name ??
                    `Nomination #${n.id}`);
            return {
              id: n.id,
              category_edition_id: n.category_edition_id,
              label,
              status: n.status ?? "ACTIVE"
            };
          })
        : [];

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

      return res.status(200).json({
        draft,
        seats: seats.map((s) => ({
          seat_number: s.seat_number,
          league_member_id: s.league_member_id,
          user_id: s.user_id ?? null,
          username: (s as { username?: string }).username ?? null
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
        ceremony_starts_at: season?.ceremony_starts_at ?? null,
        my_seat_number: mySeatNumber,
        categories,
        nominations
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

        const activeCeremonyId = await getActiveCeremonyId(tx);
        if (!activeCeremonyId) {
          throw new AppError(
            "ACTIVE_CEREMONY_NOT_SET",
            409,
            "Active ceremony is not configured"
          );
        }
        if (Number(season.ceremony_id) !== Number(activeCeremonyId)) {
          throw new AppError(
            "CEREMONY_INACTIVE",
            409,
            "Draft actions are limited to the active ceremony"
          );
        }
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
              completed_at: draft.completed_at ?? null
            }
          }
        });

        return { pick, reused: false, event };
      });

      const status = result?.reused ? 200 : 201;
      if (result?.event) {
        emitDraftEvent(result.event);
      }
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
  return async function handleExportDraft(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const draftId = Number(req.params.id);
      if (Number.isNaN(draftId)) {
        throw validationError("Invalid draft id", ["id"]);
      }

      const draft = await getDraftById(pool, draftId);
      if (!draft) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");

      const seats = await listDraftSeats(pool, draftId);
      const picks = await listDraftPicks(pool, draftId);

      return res.status(200).json({
        draft: {
          id: draft.id,
          league_id: draft.league_id,
          status: draft.status,
          draft_order_type: draft.draft_order_type,
          current_pick_number: draft.current_pick_number,
          started_at: draft.started_at ?? null,
          completed_at: draft.completed_at ?? null,
          version: draft.version,
          allow_drafting_after_lock: draft.allow_drafting_after_lock,
          lock_override_set_by_user_id: draft.lock_override_set_by_user_id ?? null,
          lock_override_set_at: draft.lock_override_set_at ?? null
        },
        seats: seats.map((seat) => ({
          seat_number: seat.seat_number,
          league_member_id: seat.league_member_id,
          user_id: seat.user_id ?? null
        })),
        picks: picks.map((pick) => ({
          pick_number: pick.pick_number,
          round_number: pick.round_number,
          seat_number: pick.seat_number,
          league_member_id: pick.league_member_id,
          user_id: pick.user_id,
          nomination_id: pick.nomination_id,
          made_at: pick.made_at
        }))
      });
    } catch (err) {
      next(err);
    }
  };
}

export function buildDraftResultsHandler(pool: Pool) {
  return async function handleDraftResults(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const draftId = Number(req.params.id);
      if (Number.isNaN(draftId)) {
        throw validationError("Invalid draft id", ["id"]);
      }
      const { results } = req.body ?? {};
      if (!Array.isArray(results)) {
        throw validationError("Missing results array", ["results"]);
      }
      const parsed = results.map((entry) => ({
        nomination_id: Number(entry?.nomination_id),
        won: entry?.won,
        points:
          entry?.points === undefined || entry?.points === null
            ? null
            : Number(entry.points)
      }));
      const invalid = parsed.some(
        (entry) =>
          !Number.isFinite(entry.nomination_id) ||
          entry.nomination_id <= 0 ||
          typeof entry.won !== "boolean" ||
          (entry.points !== null && !Number.isFinite(entry.points))
      );
      if (invalid) {
        throw validationError("Invalid results payload", ["results"]);
      }

      const draft = await getDraftById(pool, draftId);
      if (!draft) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");

      const nominationIds = parsed.map((entry) => entry.nomination_id);
      const existing = await listNominationIds(pool, nominationIds);
      if (existing.length !== nominationIds.length) {
        throw validationError("Unknown nomination_id in results", ["results"]);
      }

      await upsertDraftResults(
        pool,
        draftId,
        parsed.map((entry) => ({
          nomination_id: entry.nomination_id,
          won: entry.won,
          points: entry.points
        }))
      );

      return res.status(200).json({ ok: true, results: parsed });
    } catch (err) {
      next(err);
    }
  };
}

export function buildDraftStandingsHandler(pool: Pool) {
  return async function handleDraftStandings(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const draftId = Number(req.params.id);
      if (Number.isNaN(draftId)) {
        throw validationError("Invalid draft id", ["id"]);
      }

      const draft = await getDraftById(pool, draftId);
      if (!draft) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");

      const seats = await listDraftSeats(pool, draftId);
      const picks = await listDraftPicks(pool, draftId);
      const season = await getSeasonById(pool, draft.season_id);
      if (!season) {
        throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
      }

      const winners = await listWinnersByCeremony(pool, season.ceremony_id);
      const winnerIds = new Set(winners.map((w) => String(w.nomination_id)));

      const uniqueNominationIds = [
        ...new Set(picks.map((pick) => Number(pick.nomination_id)))
      ].sort((a, b) => a - b);
      const results = uniqueNominationIds.map((nominationId) => ({
        nomination_id: nominationId,
        won: winnerIds.has(String(nominationId)),
        points: null as number | null
      }));

      const scores = scoreDraft({
        picks: picks.map((pick) => ({
          pick_number: pick.pick_number,
          seat_number: pick.seat_number,
          nomination_id: String(pick.nomination_id)
        })),
        results: results.map((result) => ({
          nomination_id: String(result.nomination_id),
          won: result.won,
          points: result.points ?? undefined
        })),
        strategyName: season.scoring_strategy_name ?? "fixed"
      });

      const pointsBySeat = new Map(
        scores.map((score) => [score.seat_number, score.points])
      );
      const picksBySeat = new Map<number, typeof picks>();
      for (const pick of picks) {
        if (!picksBySeat.has(pick.seat_number)) {
          picksBySeat.set(pick.seat_number, []);
        }
        picksBySeat.get(pick.seat_number)?.push(pick);
      }

      const nominationFlags = picks.length
        ? await Promise.all(
            picks.map(async (pick) => {
              const nom = await getNominationWithStatus(pool, pick.nomination_id);
              return nom
                ? {
                    nomination_id: pick.nomination_id,
                    status: (nom as { status?: string }).status ?? "ACTIVE",
                    replaced_by_nomination_id:
                      (nom as { replaced_by_nomination_id?: number | null })
                        .replaced_by_nomination_id ?? null
                  }
                : null;
            })
          )
        : [];

      const standings = seats
        .map((seat) => ({
          seat_number: seat.seat_number,
          league_member_id: seat.league_member_id,
          user_id: seat.user_id ?? null,
          points: pointsBySeat.get(seat.seat_number) ?? 0,
          picks:
            picksBySeat.get(seat.seat_number)?.map((pick) => ({
              pick_number: pick.pick_number,
              round_number: pick.round_number,
              nomination_id: pick.nomination_id,
              made_at: pick.made_at
            })) ?? []
        }))
        .sort((a, b) => a.seat_number - b.seat_number);

      return res.status(200).json({
        draft: {
          id: draft.id,
          league_id: draft.league_id,
          status: draft.status,
          draft_order_type: draft.draft_order_type,
          current_pick_number: draft.current_pick_number,
          started_at: draft.started_at ?? null,
          completed_at: draft.completed_at ?? null,
          version: draft.version
        },
        standings,
        results: results.map((result) => ({
          nomination_id: result.nomination_id,
          won: result.won,
          points: result.points ?? null
        })),
        nomination_flags: nominationFlags.filter(Boolean)
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
  router.get("/:id/snapshot", buildSnapshotDraftHandler(client as Pool));
  router.get("/:id/export", buildExportDraftHandler(client as Pool));
  router.post("/:id/results", buildDraftResultsHandler(client as Pool));
  router.get("/:id/standings", buildDraftStandingsHandler(client as Pool));
  router.post("/:id/picks", buildSubmitPickHandler(client as unknown as Pool));

  return router;
}
