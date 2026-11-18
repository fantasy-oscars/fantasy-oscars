import { z } from "zod";
import { positiveIdString, positiveIdValue } from "./common.js";

/*
 * Circuit waiver claim request schemas. Players see a Circuit as a Season, so
 * the messages say "season".
 */

const RELOAD = "Something went wrong. Please reload and try again.";
const DIFFERENT_DROP = "Choose a different contender to drop";

/** `/:id/claims/:claimId` */
export const circuitClaimParams = z.object({
  id: positiveIdString(),
  claimId: positiveIdString()
});

/** A new claim, with an optional conditional drop and an optional chip. */
export const circuitClaimBody = z
  .object({
    selection_id: positiveIdValue("Choose a contender to claim"),
    drop_selection_id: positiveIdValue("Choose a contender to drop")
      .nullish()
      .transform((v) => v ?? null),
    chip_id: positiveIdValue("Choose one of your chips")
      .nullish()
      .transform((v) => v ?? null)
  })
  .refine((v) => v.selection_id !== v.drop_selection_id, {
    message: DIFFERENT_DROP,
    path: ["drop_selection_id"]
  });

/**
 * An edit to a pending claim. An omitted field stays as it is; null clears
 * it. At least one field is required.
 */
export const circuitClaimEditBody = z
  .object({
    drop_selection_id: positiveIdValue("Choose a contender to drop")
      .nullable()
      .optional(),
    chip_id: positiveIdValue("Choose one of your chips").nullable().optional()
  })
  .refine((v) => v.drop_selection_id !== undefined || v.chip_id !== undefined, {
    message: "Choose a drop or a chip to change",
    path: ["drop_selection_id"]
  });

/** The viewer's pending claims in their new order, first choice first. */
export const circuitClaimOrderBody = z.object({
  claim_ids: z.array(positiveIdValue(RELOAD), RELOAD).max(1000, RELOAD)
});
