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
  createDraftSeats,
  countNominationsByCeremony,
  listDraftSeats,
  listDraftPicks,
  listDraftResults,
  countDraftPicks,
  getPickByNomination,
  getPickByNumber,
  getPickByRequestId,
  insertDraftPickRecord,
  getNominationByIdForCeremony,
  listNominationIds,
  completeDraftIfReady,
  createDraftEvent,
  upsertDraftResults
} from "../data/repositories/draftRepository.js";
import type { DraftPickRecord } from "../data/repositories/draftRepository.js";
import { getLeagueById, getLeagueMember } from "../data/repositories/leagueRepository.js";
import {
  createExtantSeason,
  getExtantSeasonForLeague,
  getSeasonById
} from "../data/repositories/seasonRepository.js";
import { listSeasonMembers } from "../data/repositories/seasonMemberRepository.js";
import { getActiveCeremonyId } from "../data/repositories/appConfigRepository.js";
import type { DbClient } from "../data/db.js";
import { runInTransaction } from "../data/db.js";
import { transitionDraftState } from "../domain/draftState.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { computePickAssignment } from "../domain/draftOrder.js";
import { getDraftSeatForUser } from "../data/repositories/leagueRepository.js";
import { revokePendingInvitesForSeason } from "../data/repositories/seasonInviteRepository.js";
import type { Pool } from "pg";
import { SlidingWindowRateLimiter } from "../utils/rateLimiter.js";
import { emitDraftEvent } from "../realtime/draftEvents.js";
import { scoreDraft } from "../domain/scoring.js";

const pickRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 2000,
  max: 3
});

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

      const activeCeremonyId = await getActiveCeremonyId(client);
      if (!activeCeremonyId) {
        throw new AppError(
          "ACTIVE_CEREMONY_NOT_SET",
          409,
          "Active ceremony is not configured"
        );
      }
      if (Number(league.ceremony_id) !== Number(activeCeremonyId)) {
        throw new AppError(
          "CEREMONY_INACTIVE",
          409,
          "Drafts can only be created for the active ceremony"
        );
      }

      const season =
        (await getExtantSeasonForLeague(client, leagueIdNum)) ??
        (await createExtantSeason(client, {
          league_id: leagueIdNum,
          ceremony_id: league.ceremony_id
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

      const existing = await getDraftByLeagueId(client, leagueIdNum);
      if (existing) {
        throw new AppError("DRAFT_EXISTS", 409, "Draft already exists for this league");
      }

      const draft = await createDraft(client, {
        league_id: leagueIdNum,
        season_id: season.id,
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
        if (!season || season.status !== "EXTANT") {
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
        const picksPerSeat = Math.floor(nominationCount / seatTotal);
        if (picksPerSeat <= 0) {
          throw new AppError(
            "PREREQ_INSUFFICIENT_NOMINATIONS",
            400,
            "Not enough nominations for the number of participants"
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
          tx,
          draft.id,
          draft.current_pick_number ?? 1,
          transitioned.started_at ?? now,
          picksPerSeat
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
              completed_at: updated.completed_at
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

export function buildSnapshotDraftHandler(pool: Pool) {
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
      const totalRequired = seats.length * picksPerSeat;
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
          const freshTotalRequired = freshSeats.length * picksPerSeat;
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
      if (season) {
        nomineePoolSize = await countNominationsByCeremony(pool, season.ceremony_id);
      }

      return res.status(200).json({
        draft,
        seats,
        picks,
        version: draft.version,
        picks_per_seat: picksPerSeat,
        nominee_pool_size: nomineePoolSize
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
        if (draft.status !== "IN_PROGRESS") {
          throw new AppError("DRAFT_NOT_IN_PROGRESS", 409, "Draft is not in progress");
        }

        const season = await getSeasonById(tx, draft.season_id);
        if (!season || season.status !== "EXTANT") {
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

        const seats = await listDraftSeats(tx, draftIdNum);
        const seatCount = seats.length;
        if (seatCount === 0) {
          throw new AppError("PREREQ_MISSING_SEATS", 400, "No draft seats configured");
        }

        const picksPerSeat = resolvePicksPerSeat(draft, league);
        const totalRequiredPicks = seatCount * picksPerSeat;
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
        const requiredPicks = seatTotal * picksPerSeat;
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
          version: draft.version
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
      const results = await listDraftResults(pool, draftId);

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
        }))
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
        }))
      });
    } catch (err) {
      next(err);
    }
  };
}

export function createDraftsRouter(client: DbClient, authSecret: string) {
  const router = express.Router();

  router.use(requireAuth(authSecret));
  router.post("/", buildCreateDraftHandler(client));
  router.post("/:id/start", buildStartDraftHandler(client as Pool));
  router.get("/:id/snapshot", buildSnapshotDraftHandler(client as Pool));
  router.get("/:id/export", buildExportDraftHandler(client as Pool));
  router.post("/:id/results", buildDraftResultsHandler(client as Pool));
  router.get("/:id/standings", buildDraftStandingsHandler(client as Pool));
  router.post("/:id/picks", buildSubmitPickHandler(client as unknown as Pool));

  return router;
}
