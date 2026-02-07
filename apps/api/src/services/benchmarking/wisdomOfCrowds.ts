import type { DbClient } from "../../data/db.js";
import { query, runInTransaction } from "../../data/db.js";
import type { Pool } from "pg";
import {
  getWisdomBenchmarkForCeremony,
  upsertWisdomBenchmarkForCeremony,
  type WisdomBenchmarkRow
} from "../../data/repositories/wisdomBenchmarkRepository.js";

type SeasonDraftInput = {
  season_id: number;
  scoring_strategy_name: "fixed" | "negative" | "category_weighted" | string | null;
  category_weights: Record<string, number> | null;
  draft_id: number;
  draft_order: number[]; // all nominees, drafted first then undrafted
};

type NominationInput = { id: number; category_edition_id: number };

function normalizeWeightsMap(input: unknown): Record<number, number> {
  if (!input || typeof input !== "object") return {};
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const keyNum = Number(k);
    const valNum = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(keyNum) || !Number.isFinite(valNum)) continue;
    out[keyNum] = Math.trunc(valNum);
  }
  return out;
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function deriveSeasonCategoryWeights(args: {
  scoring_strategy_name: SeasonDraftInput["scoring_strategy_name"];
  category_weights: SeasonDraftInput["category_weights"];
  categoryIds: number[];
}): Record<number, number> {
  const raw = normalizeWeightsMap(args.category_weights);
  if (args.scoring_strategy_name === "category_weighted") {
    // Default missing weights to 1 for stability.
    const out: Record<number, number> = {};
    for (const id of args.categoryIds) out[id] = clampInt(raw[id] ?? 1, -99, 99);
    return out;
  }
  const fallback = args.scoring_strategy_name === "negative" ? -1 : 1;
  const out: Record<number, number> = {};
  for (const id of args.categoryIds) out[id] = fallback;
  return out;
}

export function fitWisdomOfCrowds(args: {
  nominations: NominationInput[];
  seasons: Array<{
    season_id: number;
    weights_by_category_id: Record<number, number>;
    draft_order: number[];
  }>;
  lambda?: number;
  temperature?: number;
  iters?: number;
  learningRate?: number;
}): { scoresByNominationId: Map<number, number>; sampleSizeByNominationId: Map<number, number> } {
  const lambda = args.lambda ?? 1e-3;
  const temperature = args.temperature ?? 0.1;
  const iters = args.iters ?? 250;
  const lr = args.learningRate ?? 0.05;

  const ids = args.nominations.map((n) => n.id).slice().sort((a, b) => a - b);
  const idxById = new Map<number, number>();
  ids.forEach((id, idx) => idxById.set(id, idx));

  const categoryByIdx = ids.map((id) => {
    const nom = args.nominations.find((n) => n.id === id);
    return nom ? nom.category_edition_id : 0;
  });

  const N = ids.length;
  const logS = new Float64Array(N);
  // Adam optimizer state
  const m = new Float64Array(N);
  const v = new Float64Array(N);
  const beta1 = 0.9;
  const beta2 = 0.999;
  const eps = 1e-8;

  const seasons = args.seasons
    .map((s) => {
      const orderIdxs = s.draft_order
        .map((id) => idxById.get(id))
        .filter((x): x is number => typeof x === "number");
      return { season_id: s.season_id, weights_by_category_id: s.weights_by_category_id, orderIdxs };
    })
    .filter((s) => s.orderIdxs.length === N);

  // Sample size: number of seasons with non-zero weight for the nominee's category.
  const sampleSizes = new Int32Array(N);
  for (const s of seasons) {
    let anySignal = false;
    for (let i = 0; i < N; i++) {
      const catId = categoryByIdx[i];
      const w = s.weights_by_category_id[catId] ?? 0;
      if (w !== 0) {
        sampleSizes[i] += 1;
        anySignal = true;
      }
    }
    if (!anySignal) {
      // If the season has no signal at all, roll back its contribution entirely.
      for (let i = 0; i < N; i++) {
        const catId = categoryByIdx[i];
        const w = s.weights_by_category_id[catId] ?? 0;
        if (w !== 0) sampleSizes[i] -= 1;
      }
    }
  }

  // Only use seasons with at least some non-zero weight signal.
  const usableSeasons = seasons.filter((s) => {
    for (let i = 0; i < N; i++) {
      const w = s.weights_by_category_id[categoryByIdx[i]] ?? 0;
      if (w !== 0) return true;
    }
    return false;
  });

  for (let t = 1; t <= iters; t += 1) {
    const grad = new Float64Array(N);

    // LL gradient across seasons.
    for (const s of usableSeasons) {
      // Precompute s_i, u_i, v_i for the season.
      const sArr = new Float64Array(N);
      const coeff = new Float64Array(N);
      const u = new Float64Array(N);
      let maxU = -Infinity;

      for (let i = 0; i < N; i++) {
        const sVal = Math.exp(logS[i]);
        sArr[i] = sVal;
        const w = s.weights_by_category_id[categoryByIdx[i]] ?? 0;
        const c = temperature * w * sVal;
        coeff[i] = c;
        const ui = temperature * w * sVal;
        u[i] = ui;
        if (ui > maxU) maxU = ui;
      }

      const vArr = new Float64Array(N);
      let sum = 0;
      for (let i = 0; i < N; i++) {
        const vi = Math.exp(u[i] - maxU);
        vArr[i] = vi;
        sum += vi;
      }

      // Remaining set tracked implicitly: for PL, we loop over observed order.
      const present = new Uint8Array(N);
      present.fill(1);

      for (const chosenIdx of s.orderIdxs) {
        if (!present[chosenIdx]) continue;
        // Denominator contribution for all remaining.
        // grad_i -= p_i * coeff_i where p_i = v_i / sum
        if (sum > 0) {
          for (let i = 0; i < N; i++) {
            if (!present[i]) continue;
            const p = vArr[i] / sum;
            grad[i] -= p * coeff[i];
          }
        }
        // Chosen contribution.
        grad[chosenIdx] += coeff[chosenIdx];

        // Remove chosen from remaining.
        present[chosenIdx] = 0;
        sum -= vArr[chosenIdx];
      }
    }

    // L2 regularization on logS (keeps values bounded).
    for (let i = 0; i < N; i++) {
      grad[i] -= 2 * lambda * logS[i];
    }

    // Adam update (gradient ascent).
    for (let i = 0; i < N; i++) {
      m[i] = beta1 * m[i] + (1 - beta1) * grad[i];
      v[i] = beta2 * v[i] + (1 - beta2) * grad[i] * grad[i];
      const mHat = m[i] / (1 - Math.pow(beta1, t));
      const vHat = v[i] / (1 - Math.pow(beta2, t));
      logS[i] += (lr * mHat) / (Math.sqrt(vHat) + eps);
      // Soft clamp to keep stability.
      if (logS[i] > 6) logS[i] = 6;
      if (logS[i] < -6) logS[i] = -6;
    }
  }

  const scoresByNominationId = new Map<number, number>();
  const sampleSizeByNominationId = new Map<number, number>();
  for (let i = 0; i < N; i++) {
    const id = ids[i];
    scoresByNominationId.set(id, Math.exp(logS[i]));
    sampleSizeByNominationId.set(id, sampleSizes[i]);
  }

  return { scoresByNominationId, sampleSizeByNominationId };
}

export async function recomputeWisdomBenchmarkForCeremonyTx(args: {
  tx: DbClient;
  ceremonyId: number;
}): Promise<{ version: number; itemCount: number } | null> {
  const { tx, ceremonyId } = args;

  const nominationsRes = await query<NominationInput>(
    tx,
    `SELECT n.id::int, n.category_edition_id::int
       FROM nomination n
       JOIN category_edition ce ON ce.id = n.category_edition_id
       WHERE ce.ceremony_id = $1 AND n.status = 'ACTIVE'
       ORDER BY n.id ASC`,
    [ceremonyId]
  );
  const nominations = nominationsRes.rows ?? [];
  if (nominations.length === 0) return null;

  const categoriesRes = await query<{ id: number }>(
    tx,
    `SELECT id::int FROM category_edition WHERE ceremony_id = $1 ORDER BY sort_index ASC, id ASC`,
    [ceremonyId]
  );
  const categoryIds = (categoriesRes.rows ?? []).map((r) => Number(r.id));

  const seasonsRes = await query<{
    season_id: number;
    draft_id: number;
    scoring_strategy_name: string | null;
    category_weights: unknown;
  }>(
    tx,
    `SELECT
         s.id::int AS season_id,
         d.id::int AS draft_id,
         s.scoring_strategy_name,
         s.category_weights
       FROM season s
       JOIN draft d ON d.season_id = s.id
       WHERE s.ceremony_id = $1 AND d.status = 'COMPLETED'
       ORDER BY s.id ASC`,
    [ceremonyId]
  );
  const seasonDrafts = seasonsRes.rows ?? [];
  if (seasonDrafts.length === 0) return null;

  const nomIds = nominations.map((n) => n.id);
  const nomIdSet = new Set(nomIds);

  const seasonInputs: SeasonDraftInput[] = [];
  for (const s of seasonDrafts) {
    const picksRes = await query<{ nomination_id: number }>(
      tx,
      `SELECT nomination_id::int FROM draft_pick WHERE draft_id = $1 ORDER BY pick_number ASC, id ASC`,
      [s.draft_id]
    );
    const drafted = picksRes.rows
      .map((r) => Number(r.nomination_id))
      .filter((id) => nomIdSet.has(id));
    const draftedSet = new Set(drafted);
    const undrafted = nomIds.filter((id) => !draftedSet.has(id));
    seasonInputs.push({
      season_id: Number(s.season_id),
      draft_id: Number(s.draft_id),
      scoring_strategy_name: s.scoring_strategy_name,
      category_weights: (s.category_weights ?? null) as Record<string, number> | null,
      draft_order: [...drafted, ...undrafted]
    });
  }

  const seasons = seasonInputs.map((s) => ({
    season_id: s.season_id,
    weights_by_category_id: deriveSeasonCategoryWeights({
      scoring_strategy_name: s.scoring_strategy_name,
      category_weights: s.category_weights,
      categoryIds
    }),
    draft_order: s.draft_order
  }));

  const { scoresByNominationId, sampleSizeByNominationId } = fitWisdomOfCrowds({
    nominations,
    seasons
  });

  const sorted = [...scoresByNominationId.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0] - b[0];
  });

  const items: WisdomBenchmarkRow[] = sorted.map(([nominationId, score], idx) => ({
    nomination_id: nominationId,
    score,
    rank: idx + 1,
    sample_size: sampleSizeByNominationId.get(nominationId) ?? 0
  }));

  const version = Date.now();
  const computedAt = new Date();
  await upsertWisdomBenchmarkForCeremony(tx, {
    ceremony_id: ceremonyId,
    version,
    computed_at: computedAt,
    items
  });

  return { version, itemCount: items.length };
}

export async function recomputeWisdomBenchmarkForCeremony(args: {
  pool: Pool;
  ceremonyId: number;
}): Promise<{ version: number; itemCount: number } | null> {
  const { pool, ceremonyId } = args;

  return await runInTransaction(pool, async (tx) =>
    recomputeWisdomBenchmarkForCeremonyTx({ tx, ceremonyId })
  );
}

export async function getWisdomBenchmarkCache(args: {
  db: DbClient;
  ceremonyId: number;
}) {
  return getWisdomBenchmarkForCeremony(args.db, args.ceremonyId);
}
