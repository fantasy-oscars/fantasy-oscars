import { z } from "zod";
import { MODE_PREFERENCES, SINGLE_MODE_POLICIES } from "../appearance.js";
import { BRAND_IDS, BRAND_MODES } from "../brands.js";

export const brandPreferenceSchema = z.enum([...BRAND_MODES, ...BRAND_IDS], {
  error: "Choose one of the available looks"
});

const MS_PER_DAY = 86_400_000;

/** How far a saved day may sit from the server's UTC day number (covers every time zone). */
export const DAILY_DRAW_DAY_TOLERANCE = 2;

const brandIdList = z
  .array(z.enum(BRAND_IDS), { error: "Choose valid themes" })
  .max(BRAND_IDS.length, { error: "Too many themes" })
  .transform((ids) => [...new Set(ids)]);

const dailyDrawSchema = z.strictObject({
  day: z
    .number({ error: "Choose a valid day" })
    .int({ error: "Choose a valid day" })
    .refine(
      (day) =>
        Math.abs(day - Math.floor(Date.now() / MS_PER_DAY)) <= DAILY_DRAW_DAY_TOLERANCE,
      { error: "That day is out of range" }
    ),
  brand: z.enum(BRAND_IDS, { error: "Choose one of the available looks" }),
  rounds: z.strictObject({ ceremony: brandIdList, cinema: brandIdList })
});

/**
 * A partial update: only the fields sent are written. `brand_preference: null`
 * clears the saved preference (Random applies).
 */
export const updatePreferencesBodySchema = z
  .object({
    brand_preference: brandPreferenceSchema.nullable().optional(),
    mode_preference: z
      .enum(MODE_PREFERENCES, { error: "Choose light, dark or theme default" })
      .nullable()
      .optional(),
    random_excluded_brands: brandIdList.optional(),
    undiscovered_enabled: z.boolean({ error: "Choose on or off" }).optional(),
    single_mode_policy: z
      .enum(SINGLE_MODE_POLICIES, { error: "Choose own or exclude" })
      .optional(),
    add_discovered_brands: brandIdList.optional(),
    daily_draw: dailyDrawSchema.optional()
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    error: "Send at least one preference to change"
  });

export type UpdatePreferencesBody = z.output<typeof updatePreferencesBodySchema>;
