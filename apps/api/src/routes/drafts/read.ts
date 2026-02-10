import express from "express";
import type { Pool } from "pg";
import { AppError, validationError } from "../../errors.js";
import { query } from "../../data/db.js";
import {
  getDraftById,
  listDraftSeats,
  listDraftPicks,
  listNominationIds,
  upsertDraftResults
} from "../../data/repositories/draftRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { listWinnersByCeremony } from "../../data/repositories/winnerRepository.js";
import { getNominationWithStatus } from "../../data/repositories/nominationRepository.js";
import { scoreDraft } from "../../domain/scoring.js";

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
      // For weighted scoring we attach a `points` value per nomination based on its category.
      // Other scoring strategies can ignore this field.
      let pointsByNominationId: Map<number, number> | null = null;
      if (
        (season as { scoring_strategy_name?: string | null })?.scoring_strategy_name ===
        "category_weighted"
      ) {
        const weightsRaw = (season as { category_weights?: unknown })?.category_weights;
        const weightsObj =
          weightsRaw && typeof weightsRaw === "object"
            ? (weightsRaw as Record<string, unknown>)
            : {};
        const weightByCategoryId = new Map<number, number>();
        for (const [k, v] of Object.entries(weightsObj)) {
          const id = Number(k);
          const w = Number(v);
          if (!Number.isFinite(id) || id <= 0) continue;
          if (!Number.isInteger(w) || w < -99 || w > 99) continue;
          weightByCategoryId.set(id, w);
        }

        const { rows } = await query<{ id: number; category_edition_id: number }>(
          pool,
          `SELECT id::int, category_edition_id::int
           FROM nomination
           WHERE id = ANY($1::int[])`,
          [uniqueNominationIds]
        );
        pointsByNominationId = new Map<number, number>();
        for (const r of rows) {
          const w = weightByCategoryId.get(r.category_edition_id) ?? 1;
          pointsByNominationId.set(r.id, w);
        }
      }

      const results = uniqueNominationIds.map((nominationId) => ({
        nomination_id: nominationId,
        won: winnerIds.has(String(nominationId)),
        points: pointsByNominationId?.get(nominationId) ?? null
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

