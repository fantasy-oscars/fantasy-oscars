import { z } from "zod";
import { optionalTrimmedQuery } from "./common.js";

export const leagueCreateBodySchema = z.object({
  name: z.preprocess(
    // Falsy counts as missing; anything else is stringified and trimmed.
    (v) => (v ? String(v).trim() : undefined),
    z.string("Missing required fields").min(1, "Invalid name")
  )
});

export const publicLeaguesQuerySchema = z.object({ q: optionalTrimmedQuery });

export const includeCancelledQuerySchema = z.object({
  include_cancelled: z
    .string()
    .catch("")
    .transform((v) => v === "true")
});
