import type { Pool } from "pg";
import { AppError } from "../../errors.js";
import { query, runInTransaction } from "../../data/db.js";
import {
  countNominationsByCeremony,
  completeDraftIfReady,
  getDraftById,
  getDraftByIdForUpdate,
  listDraftPicks,
  listDraftSeats,
  updateDraftOnComplete
} from "../../data/repositories/draftRepository.js";
import { getLeagueById, getLeagueMember } from "../../data/repositories/leagueRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { getSeasonMember } from "../../data/repositories/seasonMemberRepository.js";
import { listWinnersByCeremony } from "../../data/repositories/winnerRepository.js";
import { getDraftBoardForCeremony } from "../../domain/draftBoard.js";
import { computePickAssignment } from "../../domain/draftOrder.js";
import { resolvePicksPerSeat, resolveTotalRequiredPicks } from "../../domain/draftPickRules.js";
import { transitionDraftState } from "../../domain/draftState.js";
import { getWisdomBenchmarkForCeremony } from "../../data/repositories/wisdomBenchmarkRepository.js";
import { recomputeWisdomBenchmarkForCeremony } from "../benchmarking/wisdomOfCrowds.js";
import { autoPickIfExpired, runImmediateAutodraftIfEnabled } from "./autoPick.js";

type RemainderStrategy = "UNDRAFTED" | "FULL_POOL";

export async function getDraftRuntimeSnapshot(args: {
  pool: Pool;
  draftId: number;
  viewerUserId: number | null;
}) {
  const { pool, draftId, viewerUserId } = args;

  // First: enforce pick timers and any timer-driven auto picks, within a DB lock.
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
  if (totalRequired > 0 && picks.length >= totalRequired && draft.status !== "COMPLETED") {
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
          completed: false
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
        (await updateDraftOnComplete(tx, lockedDraft.id, completed.completed_at ?? new Date()));
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
    void recomputeWisdomBenchmarkForCeremony({ pool, ceremonyId: season.ceremony_id }).catch(
      () => {}
    );
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
  const winners = season ? await listWinnersByCeremony(pool, season.ceremony_id) : [];
  const wisdomBenchmark = season ? await getWisdomBenchmarkForCeremony(pool, season.ceremony_id) : null;

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

  const mySeatNumber =
    viewerUserId && seats.length
      ? (seats.find((s) => Number(s.user_id) === viewerUserId)?.seat_number ?? null)
      : null;
  const viewerLeagueMember =
    viewerUserId && league ? await getLeagueMember(pool, league.id, viewerUserId) : null;
  const viewerSeasonMember =
    viewerUserId && season ? await getSeasonMember(pool, season.id, viewerUserId) : null;
  const canManageDraft = Boolean(
    viewerUserId &&
      league &&
      (league.created_by_user_id === viewerUserId ||
        ["OWNER", "CO_OWNER"].includes(String(viewerLeagueMember?.role ?? "")) ||
        ["OWNER", "CO_OWNER"].includes(String(viewerSeasonMember?.role ?? "")))
  );

  return {
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
    total_picks: draft.total_picks ?? resolveTotalRequiredPicks(draft, seats.length, picksPerSeat),
    remainder_strategy:
      (draft as { remainder_strategy?: RemainderStrategy }).remainder_strategy ?? "UNDRAFTED",
    auto_pick_strategy: draft.auto_pick_strategy ?? null,
    pick_timer_seconds: draft.pick_timer_seconds ?? null,
    pick_deadline_at: draft.pick_deadline_at ?? null,
    pick_timer_remaining_ms: draft.pick_timer_remaining_ms ?? null,
    nominee_pool_size: nomineePoolSize,
    turn,
    ceremony_id: season?.ceremony_id ?? null,
    ceremony_starts_at: season?.ceremony_starts_at ?? null,
    ceremony_status: (season as { ceremony_status?: string | null } | null)?.ceremony_status ?? null,
    scoring_strategy_name:
      (season as { scoring_strategy_name?: string | null } | null)?.scoring_strategy_name ?? null,
    category_weights: (season as { category_weights?: unknown } | null)?.category_weights ?? null,
    wisdom_benchmark: wisdomBenchmark,
    my_seat_number: mySeatNumber,
    can_manage_draft: canManageDraft,
    categories: board.categories,
    nominations: board.nominations,
    winners
  };
}
