import { z } from "zod";
import { BRAND_PREFERENCES } from "../brands.js";

export const brandPreferenceSchema = z.enum(BRAND_PREFERENCES, {
  error: "Choose one of the available looks"
});

/** `null` clears the saved preference (the default, "rotate", applies). */
export const updatePreferencesBodySchema = z.object({
  brand_preference: brandPreferenceSchema.nullable()
});

export type UpdatePreferencesBody = z.output<typeof updatePreferencesBodySchema>;
