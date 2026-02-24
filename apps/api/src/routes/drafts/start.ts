import express from "express";
import type { Pool } from "pg";
import { AppError, validationError } from "../../errors.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import { runInTransaction } from "../../data/db.js";
import {
  countDraftSeats,
  countNominationsByCeremony,
  createDraftEvent,
  getDraftByIdForUpdate,
  updateDraftOnStart,
  createDraftSeats
} from "../../data/repositories/draftRepository.js";
import {
  getLeagueById,
  getLeagueMember
} from "../../data/repositories/leagueRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { getCeremonyDraftLockedAt } from "../../data/repositories/ceremonyRepository.js";
import {
  getSeasonMember,
  listSeasonMembers
} from "../../data/repositories/seasonMemberRepository.js";
import { revokePendingInvitesForSeason } from "../../data/repositories/seasonInviteRepository.js";
import { computeDeadline } from "../../domain/draftPickRules.js";
import { transitionDraftState } from "../../domain/draftState.js";
import { emitDraftEvent } from "../../realtime/draftEvents.js";
import { runImmediateAutodraftIfEnabled } from "../../services/drafting/autoPick.js";

type RemainderStrategy = "UNDRAFTED" | "FULL_POOL";

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
