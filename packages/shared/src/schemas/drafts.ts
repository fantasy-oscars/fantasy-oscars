import { z } from "zod";
import {
  optionalNumberLike,
  positiveIdString,
  idOrInvalid,
  requiredIdValue
} from "./common.js";
import { pickTimerSeconds } from "./seasons.js";

/** For values only the app sends, so a bad one is a bug the user can only retry past. */
const RELOAD = "Something went wrong. Please reload and try again.";

export const AUTODRAFT_STRATEGIES = [
  "RANDOM",
  "PLAN",
  "BY_CATEGORY",
  "ALPHABETICAL",
  "WISDOM"
] as const;

/** `/drafts/:id/...` */
export const draftIdParam = z.object({
  id: positiveIdString("That link doesn't look right")
});

/** Create a draft: league and settings. Commissioner and state checks stay in the route. */
export const draftCreateBodySchema = z.object({
  league_id: requiredIdValue({
    missing: RELOAD,
    invalid: RELOAD,
    falsyIsMissing: true
  }),
  draft_order_type: z
    .unknown()
    .optional()
    .transform((v) => (v === undefined || v === null ? "SNAKE" : String(v).toUpperCase()))
    .pipe(z.literal("SNAKE", "Only snake drafts are supported right now")),
  pick_timer_seconds: pickTimerSeconds
});

/**
 * The season is parsed after the league lookup, so an unknown league still
 * reports 404 before a missing season_id reports 400.
 */
export const draftCreateSeasonBodySchema = z.object({
  season_id: requiredIdValue({
    missing: RELOAD,
    invalid: RELOAD
  })
});

export const draftPickBodySchema = z.object({
  nomination_id: requiredIdValue({
    missing: "Choose a nominee",
    invalid: "Choose a nominee",
    falsyIsMissing: true
  }),
  request_id: z
    .unknown()
    .optional()
    .transform((v) => String(v ?? "").trim())
    .pipe(z.string().min(1, RELOAD).max(128, RELOAD))
});

export const draftOverrideLockBodySchema = z.object({
  allow: z.boolean("Override must be switched on or off")
});

const resultsEntryMessage = "Some results entries are incomplete or not valid";

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
    "No results were provided"
  )
});

export const draftAutodraftBodySchema = z.object({
  enabled: z.unknown().optional().transform(Boolean),
  strategy: z
    .unknown()
    .optional()
    .transform((v) => String(v ?? "RANDOM").toUpperCase())
    .pipe(z.enum(AUTODRAFT_STRATEGIES, "Choose a valid autodraft strategy")),
  plan_id: z
    .unknown()
    .optional()
    .transform((v, ctx) => {
      if (v === null || v === undefined || v === "") return null;
      const parsed = idOrInvalid("Choose a valid draft plan").safeParse(v);
      if (!parsed.success) {
        ctx.addIssue({ code: "custom", message: "Choose a valid draft plan" });
        return z.NEVER;
      }
      return parsed.data;
    })
});
