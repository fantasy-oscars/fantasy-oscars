import { z } from "zod";
import { idOrInvalid, positiveIdString } from "./common.js";

/** `/draft-plans/ceremonies/:ceremonyId` */
export const draftPlanCeremonyParams = z.object({
  ceremonyId: positiveIdString("That link doesn't look right")
});

/** `/draft-plans/:planId...` */
export const draftPlanIdParams = z.object({
  planId: positiveIdString("That link doesn't look right")
});

export const draftPlanCreateBodySchema = z.object({
  name: z
    .unknown()
    .optional()
    .transform((v) => String(v ?? "").trim())
    .pipe(z.string().min(1, "Plan name is required").max(80, "Plan name is too long"))
});

export const draftPlanItemsBodySchema = z.object({
  nomination_ids: z
    .array(
      idOrInvalid("Some of the selected nominees are not valid"),
      "Nominees must be a list"
    )
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Each nominee can only be listed once"
    )
});
