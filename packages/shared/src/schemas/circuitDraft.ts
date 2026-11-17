import { z } from "zod";
import { positiveIdString, positiveIdValue } from "./common.js";

/*
 * Circuit draft request schemas. Players see a Circuit as a Season, so the
 * messages say "season".
 */

const RELOAD = "Something went wrong. Please reload and try again.";

/** A manual pick; `request_id` makes a retried submission idempotent. */
export const circuitDraftPickBody = z.object({
  selection_id: positiveIdValue("Choose a contender to draft"),
  request_id: z
    .unknown()
    .optional()
    .transform((v) => String(v ?? "").trim())
    .pipe(z.string().min(1, RELOAD).max(128, RELOAD))
});

/** `/:id/queue/:selectionId` */
export const circuitQueueItemParams = z.object({
  id: positiveIdString(),
  selectionId: positiveIdString()
});

/** Adds a selection at the bottom of the viewer's draft queue. */
export const circuitQueueAddBody = z.object({
  selection_id: positiveIdValue("Choose a contender to queue")
});

/** The whole queue in its new order, top first. */
export const circuitQueueOrderBody = z.object({
  selection_ids: z.array(positiveIdValue(RELOAD), RELOAD).max(1000, RELOAD)
});
