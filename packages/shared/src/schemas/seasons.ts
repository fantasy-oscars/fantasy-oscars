import { z } from "zod";
import { optionalNumberLike } from "./common.js";

export const SCORING_STRATEGY_NAMES = ["fixed", "negative", "category_weighted"] as const;
export const REMAINDER_STRATEGIES = ["UNDRAFTED", "FULL_POOL"] as const;

const scoringStrategy = z.enum(SCORING_STRATEGY_NAMES, "Invalid scoring_strategy_name");
const remainderStrategy = z.enum(REMAINDER_STRATEGIES, "Invalid remainder_strategy");

const pickTimerSeconds = optionalNumberLike.refine(
  (v) => v === null || (Number.isFinite(v) && v >= 0),
  "Invalid pick_timer_seconds"
);

/** Create a season inside a league. Absent or null settings take their defaults. */
export const seasonCreateBodySchema = z.object({
  // NaN (a non-numeric value) is treated the same as no ceremony.
  ceremony_id: optionalNumberLike.transform((v) =>
    v === null || Number.isNaN(v) ? null : v
  ),
  scoring_strategy_name: scoringStrategy.nullish().transform((v) => v ?? "fixed"),
  remainder_strategy: remainderStrategy.nullish().transform((v) => v ?? "UNDRAFTED"),
  pick_timer_seconds: pickTimerSeconds
});

/** Legacy create route: a missing ceremony falls back to the active one. */
export const seasonCreateLegacyBodySchema = z.object({
  // Unlike the current route, NaN is kept so the handler can reject it.
  ceremony_id: optionalNumberLike
});

export const seasonLabelBodySchema = z.object({
  label: z.string("Invalid label").nullish()
});

/** Add or invite a member by id or username; the handler requires at least one. */
export const seasonMemberRefBodySchema = z.object({
  user_id: z
    .unknown()
    .optional()
    .transform((v): number | null => {
      if (v === undefined || v === null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }),
  username: z.string().optional().catch(undefined)
});

export const seasonScoringBodySchema = z.object({
  scoring_strategy_name: scoringStrategy,
  category_weights: z
    .record(z.string(), z.unknown(), "Invalid category_weights")
    .transform((weights, ctx) => {
      const normalized: Record<string, number> = {};
      for (const [key, raw] of Object.entries(weights)) {
        const id = Number(key);
        if (!Number.isFinite(id) || id <= 0) {
          ctx.addIssue({ code: "custom", message: "Invalid category_weights key" });
          return z.NEVER;
        }
        const weight = Number(raw);
        if (!Number.isInteger(weight) || weight < -99 || weight > 99) {
          ctx.addIssue({
            code: "custom",
            message: "Category weight must be an integer between -99 and 99"
          });
          return z.NEVER;
        }
        normalized[String(id)] = weight;
      }
      return normalized;
    })
    .optional()
});

export const seasonAllocationBodySchema = z.object({
  remainder_strategy: remainderStrategy
});

export const seasonTimerBodySchema = z.object({
  pick_timer_seconds: pickTimerSeconds
});

/** `/invites/token/:token/...` */
export const inviteTokenParam = z.object({ token: z.string().trim() });

export const inviteeSearchQuerySchema = z.object({
  q: z.string().trim().catch("")
});
