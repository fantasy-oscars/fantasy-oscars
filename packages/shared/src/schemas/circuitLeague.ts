import { z } from "zod";
import { positiveIdString, positiveIdValue } from "./common.js";

/*
 * Circuit league request schemas. Players see a Circuit as a Season, so the
 * messages say "season".
 */

/** Bounds the settings screen and the API share. */
export const CIRCUIT_LEAGUE_LIMITS = {
  rosterSize: { min: 1, max: 64 },
  pickTimerSeconds: { min: 0, max: 86400 },
  points: { min: 0, max: 100 },
  weight: { max: 100 },
  maxOwned: { min: 1, max: 64 }
} as const;

const L = CIRCUIT_LEAGUE_LIMITS;

/** A whole number in [min, max], sent as a number or numeric string. */
function wholeNumber(message: string, min: number, max: number) {
  return z
    .union(
      [
        z.number(),
        z
          .string()
          .trim()
          .regex(/^-?\d+$/)
      ],
      message
    )
    .transform(Number)
    .pipe(z.number(message).int(message).min(min, message).max(max, message));
}

const weight = z
  .union(
    [
      z.number(),
      z
        .string()
        .trim()
        .regex(/^\d+(\.\d+)?$/)
    ],
    "Enter a weight above 0"
  )
  .transform(Number)
  .pipe(
    z
      .number("Enter a weight above 0")
      .gt(0, "Enter a weight above 0")
      .max(L.weight.max, `Weights can be at most ${L.weight.max}`)
  );

/** Rejects a list that names one id twice. */
function uniqueBy<T>(key: (item: T) => number, message: string) {
  return (items: T[], ctx: z.RefinementCtx) => {
    const ids = items.map(key);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", message });
    }
  };
}

/**
 * Partial settings edit. The pick clock takes null or 0 for untimed. Draft
 * type is not offered: snake is the only draft this season.
 */
const settingsFields = z.object({
  roster_size: wholeNumber(
    `Roster size must be between ${L.rosterSize.min} and ${L.rosterSize.max}`,
    L.rosterSize.min,
    L.rosterSize.max
  ).optional(),
  pick_timer_seconds: wholeNumber(
    "Pick clock must be zero or a whole number of seconds, up to a day",
    L.pickTimerSeconds.min,
    L.pickTimerSeconds.max
  )
    .nullable()
    .optional(),
  auto_draft_enabled: z.boolean("Auto-draft must be on or off").optional(),
  nomination_points: wholeNumber(
    `Nomination points must be between ${L.points.min} and ${L.points.max}`,
    L.points.min,
    L.points.max
  ).optional(),
  win_bonus_points: wholeNumber(
    `Win points must be between ${L.points.min} and ${L.points.max}`,
    L.points.min,
    L.points.max
  ).optional()
});

export const circuitLeagueSettingsBody = settingsFields.transform((v, ctx) => {
  if (Object.values(v).every((value) => value === undefined)) {
    ctx.addIssue({ code: "custom", message: "No fields to update" });
    return z.NEVER;
  }
  return v;
});

/**
 * The enabled events, replacing the previous set. Any subset, including none.
 * An absent weight is 1.
 */
const eventsList = z
  .array(
    z.object({
      circuit_event_id: positiveIdValue("Choose events in this season"),
      weight: weight.optional().transform((w) => w ?? 1)
    }),
    "Choose events in this season"
  )
  .superRefine(uniqueBy((e) => e.circuit_event_id, "List each event at most once"));

export const circuitLeagueEventsBody = z.object({ events: eventsList });

/**
 * Category weights and limits. Each listed category is set in full (an absent
 * weight is 1, an absent or null limit is unlimited); unlisted ones keep theirs.
 */
const categoriesList = z
  .array(
    z.object({
      circuit_category_id: positiveIdValue("Choose categories in this season"),
      weight: weight.optional().transform((w) => w ?? 1),
      max_owned: wholeNumber(
        `Category limits must be between ${L.maxOwned.min} and ${L.maxOwned.max}, or none`,
        L.maxOwned.min,
        L.maxOwned.max
      )
        .nullish()
        .transform((v) => v ?? null)
    }),
    "Choose categories in this season"
  )
  .min(1, "Choose categories in this season")
  .superRefine(uniqueBy((c) => c.circuit_category_id, "List each category at most once"));

export const circuitLeagueCategoriesBody = z.object({ categories: categoriesList });

/**
 * Starts a competition. Optional initial settings, enabled events and category
 * settings are applied in the same transaction; anything left out keeps the
 * defaults.
 */
export const circuitLeagueCreateBody = z.object({
  circuit_id: positiveIdValue("Choose a season"),
  settings: settingsFields.optional(),
  events: eventsList.optional(),
  categories: categoriesList.optional()
});

/** `/circuit-leagues/:id/standings/ceremonies/:ceremonyId` */
export const circuitLeagueCeremonyParams = z.object({
  id: positiveIdString(),
  ceremonyId: positiveIdString()
});
