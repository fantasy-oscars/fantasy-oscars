import express from "express";
import { AppError, validationError } from "../errors.js";
import {
  createDraft,
  getDraftById,
  getDraftByLeagueId,
  updateDraftOnStart,
  updateDraftCurrentPick,
  updateDraftOnComplete,
  getDraftByIdForUpdate,
  countDraftSeats,
  countNominations,
  listDraftSeats,
  listDraftPicks,
  countDraftPicks,
  getPickByNomination,
  getPickByRequestId,
  insertDraftPickRecord,
  getNominationById,
  completeDraftIfReady
} from "../data/repositories/draftRepository.js";
import type { DraftPickRecord } from "../data/repositories/draftRepository.js";
import { getLeagueById, getLeagueMember } from "../data/repositories/leagueRepository.js";
import type { DbClient } from "../data/db.js";
import { runInTransaction } from "../data/db.js";
import { transitionDraftState } from "../domain/draftState.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { computePickAssignment } from "../domain/draftOrder.js";
import { getDraftSeatForUser } from "../data/repositories/leagueRepository.js";
import type { Pool } from "pg";
import { SlidingWindowRateLimiter } from "../utils/rateLimiter.js";

const pickRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 2000,
  max: 3
});

export function buildCreateDraftHandler(client: DbClient) {
  return async function handleCreateDraft(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const { league_id, draft_order_type } = req.body ?? {};

      const leagueIdNum = Number(league_id);
      if (!league_id || Number.isNaN(leagueIdNum)) {
        throw validationError("Missing or invalid league_id", ["league_id"]);
      }

      const order = (draft_order_type ?? "SNAKE").toUpperCase();
      if (order !== "SNAKE" && order !== "LINEAR") {
        throw validationError("Invalid draft_order_type", ["draft_order_type"]);
      }

      const league = await getLeagueById(client, leagueIdNum);
      if (!league) {
        throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
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

      const existing = await getDraftByLeagueId(client, leagueIdNum);
      if (existing) {
        throw new AppError("DRAFT_EXISTS", 409, "Draft already exists for this league");
      }

      const draft = await createDraft(client, {
        league_id: leagueIdNum,
        status: "PENDING",
        draft_order_type: order,
        current_pick_number: null,
        started_at: null,
        completed_at: null
      });

      return res.status(201).json({ draft });
    } catch (err) {
      next(err);
    }
  };
}

export function buildStartDraftHandler(client: DbClient) {
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

      const draft = await getDraftById(client, draftId);
      if (!draft) {
        throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");
      }

      const league = await getLeagueById(client, draft.league_id);
      if (!league) {
        throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
      }

      const userId = Number((req as AuthedRequest).auth?.sub);
      const leagueMember = await getLeagueMember(client, league.id, userId);
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

      const seats = await countDraftSeats(client, draftId);
      if (seats <= 0) {
        throw new AppError("PREREQ_MISSING_SEATS", 400, "No draft seats configured");
      }

      const nominationCount = await countNominations(client);
      if (nominationCount <= 0) {
        throw new AppError(
          "PREREQ_MISSING_NOMINATIONS",
          400,
          "No nominations loaded; load nominees before starting draft"
        );
      }

      const now = new Date();
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
        client,
        draft.id,
        draft.current_pick_number ?? 1,
        transitioned.started_at ?? now
      );
      if (!updated) throw new AppError("INTERNAL_ERROR", 500, "Failed to start draft");

      return res.status(200).json({ draft: updated });
    } catch (err) {
      next(err);
    }
  };
}

export function buildSnapshotDraftHandler(client: DbClient) {
  return async function handleSnapshotDraft(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const draftId = Number(req.params.id);
      if (Number.isNaN(draftId)) {
        throw validationError("Invalid draft id", ["id"]);
      }

      const draft = await getDraftById(client, draftId);
      if (!draft) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");

      const seats = await listDraftSeats(client, draftId);
      const picks = await listDraftPicks(client, draftId);
      const version = picks.length;

      // If all required picks are made but status not updated, complete draft lazily.
      const league = await getLeagueById(client, draft.league_id);
      const rosterSizeRaw = Number(league?.roster_size);
      const rosterSize =
        Number.isFinite(rosterSizeRaw) && rosterSizeRaw > 0 ? rosterSizeRaw : 1;
      const totalRequired = seats.length * rosterSize;
      if (
        totalRequired > 0 &&
        picks.length >= totalRequired &&
        draft.status !== "COMPLETED"
      ) {
        const completed = transitionDraftState(
          {
            id: draft.id,
            status: draft.status,
            started_at: draft.started_at,
            completed_at: draft.completed_at
          },
          "COMPLETED"
        );
        const updated =
          (await completeDraftIfReady(
            client,
            draft.id,
            completed.completed_at ?? new Date(),
            totalRequired
          )) ??
          (await updateDraftOnComplete(
            client,
            draft.id,
            completed.completed_at ?? new Date()
          ));
        draft.status = updated?.status ?? completed.status;
        draft.completed_at = updated?.completed_at ?? completed.completed_at;
        draft.current_pick_number = null;
      }

      return res.status(200).json({ draft, seats, picks, version });
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
        if (draft.status !== "IN_PROGRESS") {
          throw new AppError("DRAFT_NOT_IN_PROGRESS", 409, "Draft is not in progress");
        }

        const league = await getLeagueById(tx, draft.league_id);
        if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");

        const seats = await listDraftSeats(tx, draftIdNum);
        const seatCount = seats.length;
        if (seatCount === 0) {
          throw new AppError("PREREQ_MISSING_SEATS", 400, "No draft seats configured");
        }

        const rosterSizeRaw = Number(league.roster_size);
        const rosterSize =
          Number.isFinite(rosterSizeRaw) && rosterSizeRaw > 0 ? rosterSizeRaw : 1;
        const totalRequiredPicks = seatCount * rosterSize;
        const existingPickCount = await countDraftPicks(tx, draftIdNum);
        const draftCurrent = draft.current_pick_number ?? 0;
        const currentPick = Math.max(
          existingPickCount + 1,
          draftCurrent || existingPickCount + 1
        );
        if (existingPickCount >= totalRequiredPicks) {
          throw new AppError("DRAFT_NOT_IN_PROGRESS", 409, "Draft is completed");
        }

        const nomination = await getNominationById(tx, nominationIdNum);
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
          draft_order_type: draft.draft_order_type,
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
          }
          throw err;
        }

        // Complete immediately when this pick satisfies the total required picks.
        const newPickCount = existingPickCount + 1;
        // Recompute seat count defensively in case earlier read was stale.
        const seatTotal = await countDraftSeats(tx, draftIdNum);
        const requiredPicks = seatTotal * rosterSize;
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
        } else {
          const nextPickNumber = newPickCount + 1;
          await updateDraftCurrentPick(tx, draftIdNum, nextPickNumber);
          draft.current_pick_number = nextPickNumber;
        }

        return { pick, reused: false };
      });

      const status = result?.reused ? 200 : 201;
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

export function createDraftsRouter(client: DbClient, authSecret: string) {
  const router = express.Router();

  router.use(requireAuth(authSecret));
  router.post("/", buildCreateDraftHandler(client));
  router.post("/:id/start", buildStartDraftHandler(client));
  router.get("/:id/snapshot", buildSnapshotDraftHandler(client));
  router.post("/:id/picks", buildSubmitPickHandler(client as unknown as Pool));

  return router;
}
