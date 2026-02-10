import express from "express";
import type { Pool } from "pg";
import { AppError, validationError } from "../../errors.js";
import { query, runInTransaction } from "../../data/db.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import {
  countNominationsByCeremony,
  completeDraftIfReady,
  createDraftEvent,
  getDraftById,
  getDraftByIdForUpdate,
  listDraftPicks,
  listDraftSeats,
  setDraftLockOverride,
  updateDraftOnComplete
} from "../../data/repositories/draftRepository.js";
import {
  getLeagueById,
  getLeagueMember
} from "../../data/repositories/leagueRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { getCeremonyDraftLockedAt } from "../../data/repositories/ceremonyRepository.js";
import { getSeasonMember } from "../../data/repositories/seasonMemberRepository.js";
import { listWinnersByCeremony } from "../../data/repositories/winnerRepository.js";
import { getDraftBoardForCeremony } from "../../domain/draftBoard.js";
import { computePickAssignment } from "../../domain/draftOrder.js";
import { resolvePicksPerSeat, resolveTotalRequiredPicks } from "../../domain/draftPickRules.js";
import { transitionDraftState } from "../../domain/draftState.js";
import { emitDraftEvent } from "../../realtime/draftEvents.js";
import { getWisdomBenchmarkForCeremony } from "../../data/repositories/wisdomBenchmarkRepository.js";
import { recomputeWisdomBenchmarkForCeremony } from "../../services/benchmarking/wisdomOfCrowds.js";
import {
  autoPickIfExpired,
  runImmediateAutodraftIfEnabled
} from "../../services/drafting/autoPick.js";

type RemainderStrategy = "UNDRAFTED" | "FULL_POOL";

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
