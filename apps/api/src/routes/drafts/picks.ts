import express from "express";
import type { Pool } from "pg";
import { AppError, validationError } from "../../errors.js";
import { emitDraftEvent } from "../../realtime/draftEvents.js";
import { recomputeWisdomBenchmarkForCeremony } from "../../services/benchmarking/wisdomOfCrowds.js";
import {
  completeDraftIfReady,
  countDraftPicks,
  countDraftSeats,
  createDraftEvent,
  getDraftByIdForUpdate,
  getPickByNomination,
  getPickByNumber,
  getPickByRequestId,
  getNominationByIdForCeremony,
  insertDraftPickRecord,
  listDraftSeats,
  updateDraftCurrentPick,
  updateDraftOnComplete,
  updateDraftTimer
} from "../../data/repositories/draftRepository.js";
import type { DraftPickRecord } from "../../data/repositories/draftRepository.js";
import { getLeagueById, getDraftSeatForUser } from "../../data/repositories/leagueRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { getCeremonyDraftLockedAt } from "../../data/repositories/ceremonyRepository.js";
import { runInTransaction } from "../../data/db.js";
import { computePickAssignment } from "../../domain/draftOrder.js";
import {
  computeDeadline,
  resolvePicksPerSeat,
  resolveTotalRequiredPicks
} from "../../domain/draftPickRules.js";
import { transitionDraftState } from "../../domain/draftState.js";
import { SlidingWindowRateLimiter } from "../../utils/rateLimiter.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import {
  autoPickIfExpired,
  runImmediateAutodraftIfEnabled
} from "../../services/drafting/autoPick.js";

const pickRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 2000,
  max: 3
});

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

