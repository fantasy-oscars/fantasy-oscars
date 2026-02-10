import express from "express";
import type { Router } from "express";
import { AppError, validationError } from "../errors.js";
import {
  createDraft,
  getDraftBySeasonId,
  updateDraftOnStart,
  getDraftByIdForUpdate,
  countDraftSeats,
  createDraftSeats,
  countNominationsByCeremony,
  createDraftEvent
} from "../data/repositories/draftRepository.js";
import {
  getLeagueById,
  getLeagueMember
} from "../data/repositories/leagueRepository.js";
import { getSeasonById } from "../data/repositories/seasonRepository.js";
import { getCeremonyDraftLockedAt } from "../data/repositories/ceremonyRepository.js";
import {
  getSeasonMember,
  listSeasonMembers
} from "../data/repositories/seasonMemberRepository.js";
import type { DbClient } from "../data/db.js";
import { query, runInTransaction } from "../data/db.js";
import { transitionDraftState } from "../domain/draftState.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { revokePendingInvitesForSeason } from "../data/repositories/seasonInviteRepository.js";
import type { Pool } from "pg";
import {
  computeDeadline
} from "../domain/draftPickRules.js";
import { emitDraftEvent } from "../realtime/draftEvents.js";
import {
  buildDraftResultsHandler as buildDraftResultsHandlerImpl,
  buildDraftStandingsHandler as buildDraftStandingsHandlerImpl,
  buildExportDraftHandler as buildExportDraftHandlerImpl
} from "./drafts/read.js";
import { buildSubmitPickHandler as buildSubmitPickHandlerImpl } from "./drafts/picks.js";
import {
  buildPauseDraftHandler as buildPauseDraftHandlerImpl,
  buildResumeDraftHandler as buildResumeDraftHandlerImpl
} from "./drafts/lifecycle.js";
import {
  buildOverrideDraftLockHandler as buildOverrideDraftLockHandlerImpl,
  buildSnapshotDraftHandler as buildSnapshotDraftHandlerImpl,
  buildTickDraftHandler as buildTickDraftHandlerImpl,
  tickDraft as tickDraftImpl
} from "./drafts/runtime.js";
import { runImmediateAutodraftIfEnabled } from "../services/drafting/autoPick.js";
import {
  buildGetDraftAutodraftHandler,
  buildUpsertDraftAutodraftHandler
} from "./drafts/autodraft.js";

type RemainderStrategy = "UNDRAFTED" | "FULL_POOL";

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

export function buildOverrideDraftLockHandler(pool: Pool) {
  return buildOverrideDraftLockHandlerImpl(pool);
}

export function buildPauseDraftHandler(pool: Pool) {
  return buildPauseDraftHandlerImpl(pool);
}

export function buildResumeDraftHandler(pool: Pool) {
  return buildResumeDraftHandlerImpl(pool);
}

export function buildSnapshotDraftHandler(pool: Pool) {
  return buildSnapshotDraftHandlerImpl(pool);
}

export function buildSubmitPickHandler(pool: Pool) {
  return buildSubmitPickHandlerImpl(pool);
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
  return await tickDraftImpl(pool, draftId);
}

export function buildTickDraftHandler(pool: Pool) {
  return buildTickDraftHandlerImpl(pool);
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
  router.get("/:id/autodraft", buildGetDraftAutodraftHandler(client));
  router.post("/:id/autodraft", buildUpsertDraftAutodraftHandler(client as Pool));

  return router;
}
