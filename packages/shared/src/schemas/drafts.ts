import { z } from "zod";
import {
  optionalNumberLike,
  positiveIdString,
  idOrInvalid,
  requiredIdValue
} from "./common.js";
import { pickTimerSeconds } from "./seasons.js";

export const AUTODRAFT_STRATEGIES = [
  "RANDOM",
  "PLAN",
  "BY_CATEGORY",
  "ALPHABETICAL",
  "WISDOM"
] as const;

/** `/drafts/:id/...` */
export const draftIdParam = z.object({ id: positiveIdString("Invalid draft id") });

/** Create a draft: league and settings. Commissioner and state checks stay in the route. */
export const draftCreateBodySchema = z.object({
  league_id: requiredIdValue({
    missing: "Missing or invalid league_id",
    invalid: "Missing or invalid league_id",
    falsyIsMissing: true
  }),
  draft_order_type: z
    .unknown()
    .optional()
    .transform((v) => (v === undefined || v === null ? "SNAKE" : String(v).toUpperCase()))
    .pipe(z.literal("SNAKE", "Invalid draft_order_type (MVP supports SNAKE only)")),
  pick_timer_seconds: pickTimerSeconds
});

/**
 * The season is parsed after the league lookup, so an unknown league still
 * reports 404 before a missing season_id reports 400.
 */
export const draftCreateSeasonBodySchema = z.object({
  season_id: requiredIdValue({
    missing: "Missing season_id",
    invalid: "Invalid season_id"
  })
});

export const draftPickBodySchema = z.object({
  nomination_id: requiredIdValue({
    missing: "Missing nomination_id",
    invalid: "Invalid nomination_id",
    falsyIsMissing: true
  }),
  request_id: z
    .unknown()
    .optional()
    .transform((v) => String(v ?? "").trim())
    .pipe(z.string().min(1, "Missing request_id").max(128, "request_id too long"))
});

export const draftOverrideLockBodySchema = z.object({
  allow: z.boolean("Invalid override flag")
});

const resultsEntryMessage = "Invalid results payload";

export const draftResultsBodySchema = z.object({
  results: z.array(
    z.object(
      {
        nomination_id: idOrInvalid(resultsEntryMessage),
        won: z.boolean(resultsEntryMessage),
        points: optionalNumberLike.refine(
          (v) => v === null || Number.isFinite(v),
          resultsEntryMessage
        )
      },
      resultsEntryMessage
    ),
    "Missing results array"
  )
});

export const draftAutodraftBodySchema = z.object({
  enabled: z.unknown().optional().transform(Boolean),
  strategy: z
    .unknown()
    .optional()
    .transform((v) => String(v ?? "RANDOM").toUpperCase())
    .pipe(z.enum(AUTODRAFT_STRATEGIES, "Invalid strategy")),
  plan_id: z
    .unknown()
    .optional()
    .transform((v, ctx) => {
      if (v === null || v === undefined || v === "") return null;
      const parsed = idOrInvalid("Invalid plan_id").safeParse(v);
      if (!parsed.success) {
        ctx.addIssue({ code: "custom", message: "Invalid plan_id" });
        return z.NEVER;
      }
      return parsed.data;
    })
});
