import { z } from "zod";
import { idOrInvalid, positiveIdString } from "./common.js";

/** `/draft-plans/ceremonies/:ceremonyId` */
export const draftPlanCeremonyParams = z.object({
  ceremonyId: positiveIdString("Invalid ceremony id")
});

/** `/draft-plans/:planId...` */
export const draftPlanIdParams = z.object({
  planId: positiveIdString("Invalid plan id")
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
    .array(idOrInvalid("Invalid nomination_ids"), "nomination_ids must be an array")
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate nomination_ids")
});
