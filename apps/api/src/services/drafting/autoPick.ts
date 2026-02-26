import type { Pool } from "pg";
import type { DbClient } from "../../data/db.js";
import { runInTransaction } from "../../data/db.js";
import type {
  DraftPickRecord,
  DraftRecord
} from "../../data/repositories/draftRepository.js";
import {
  completeDraftIfReady,
  createDraftEvent,
  getDraftByIdForUpdate,
  insertDraftPickRecord,
  listDraftPicks,
  listDraftSeats,
  updateDraftCurrentPick,
  updateDraftOnComplete,
  updateDraftTimer
} from "../../data/repositories/draftRepository.js";
import { getLeagueById } from "../../data/repositories/leagueRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { listNominationsForCeremony } from "../../data/repositories/nominationRepository.js";
import {
  getDraftAutodraftConfig,
  listDraftPlanNominationIdsForUserCeremony
} from "../../data/repositories/draftAutodraftRepository.js";
import { getWisdomBenchmarkForCeremony } from "../../data/repositories/wisdomBenchmarkRepository.js";
import { emitDraftEvent } from "../../realtime/draftEvents.js";
import { computePickAssignment } from "../../domain/draftOrder.js";
import {
  resolvePicksPerSeat,
  resolveTotalRequiredPicks
} from "../../domain/draftPickRules.js";
import { computeDeadline } from "../../domain/draftPickRules.js";
import {
  resolveStrategy,
  type AutoPickConfig
} from "../../domain/autodraftStrategies.js";
import {
  chooseAlphabetical,
  chooseAlphabeticalThenCategory,
  chooseByCategoryOrder,
  chooseCanonical,
  chooseCustomUser,
  chooseRandomized
} from "../../domain/autodraftStrategies.js";
import { recomputeWisdomBenchmarkForCeremonyTx } from "../benchmarking/wisdomOfCrowds.js";

export type AutoPickReason = "TIMER_EXPIRED" | "USER_AUTODRAFT";

export async function autoPickOne(options: {
  tx: DbClient;
  draft: DraftRecord;
  season: { id: number; ceremony_id: number };
  league: { roster_size: number | string | null };
  reason: AutoPickReason;
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

export async function autoPickIfExpired(options: {
  tx: DbClient;
  draft: DraftRecord;
  season: { id: number; ceremony_id: number };
  league: { roster_size: number | string | null };
}) {
  const { tx, draft, season, league } = options;
  if (draft.status !== "IN_PROGRESS") return draft;
  if (draft.pick_timer_seconds === null) return draft;
  if (!draft.pick_deadline_at) {
    const deadline = computeDeadline(new Date(), draft.pick_timer_seconds);
    const timerUpdated = await updateDraftTimer(tx, draft.id, deadline, null);
    const nextDraft: DraftRecord = {
      ...draft,
      pick_deadline_at: timerUpdated?.pick_deadline_at ?? deadline,
      pick_timer_remaining_ms: null
    };
    if (nextDraft.pick_deadline_at) {
      const event = await createDraftEvent(tx, {
        draft_id: draft.id,
        event_type: "draft.timer.deadline_set",
        payload: {
          draft: {
            status: nextDraft.status,
            current_pick_number: nextDraft.current_pick_number,
            pick_deadline_at: nextDraft.pick_deadline_at
          }
        }
      });
      emitDraftEvent(event);
    }
    return nextDraft;
  }
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

export function scheduleUserAutodraft(args: {
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

export async function runImmediateAutodraftIfEnabled(args: {
  pool: Pool;
  draftId: number;
}) {
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
