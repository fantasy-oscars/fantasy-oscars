import { z } from "zod";
import { positiveIdValue } from "./common.js";

/*
 * Circuit roster request schemas: drops and free-agent adds. Players see a
 * Circuit as a Season, so the messages say "season".
 */

export const circuitDropBody = z.object({
  selection_id: positiveIdValue("Choose a contender to drop")
});

/** A free-agent add, with an optional drop in the same transaction. */
export const circuitFreeAgentBody = z
  .object({
    selection_id: positiveIdValue("Choose a contender to add"),
    drop_selection_id: positiveIdValue("Choose a contender to drop")
      .nullish()
      .transform((v) => v ?? null)
  })
  .refine((v) => v.selection_id !== v.drop_selection_id, {
    message: "Choose a different contender to drop",
    path: ["drop_selection_id"]
  });
