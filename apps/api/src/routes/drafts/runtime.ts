import express from "express";
import type { Pool } from "pg";
import { AppError, validationError } from "../../errors.js";
import { runInTransaction } from "../../data/db.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import {
  createDraftEvent,
  getDraftByIdForUpdate,
  setDraftLockOverride
} from "../../data/repositories/draftRepository.js";
import {
  getLeagueById,
  getLeagueMember
} from "../../data/repositories/leagueRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { getCeremonyDraftLockedAt } from "../../data/repositories/ceremonyRepository.js";
import { emitDraftEvent } from "../../realtime/draftEvents.js";
import {
  autoPickIfExpired,
  runImmediateAutodraftIfEnabled
} from "../../services/drafting/autoPick.js";
import { getDraftRuntimeSnapshot } from "../../services/drafting/runtimeSnapshot.js";

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

      const snapshot = await getDraftRuntimeSnapshot({
        pool,
        draftId,
        viewerUserId: req.auth?.sub ? Number(req.auth.sub) : null
      });
      return res.status(200).json(snapshot);
    } catch (err) {
      next(err);
    }
  };
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
