import { CEREMONY_LIFECYCLE } from "@/decisions/ceremonyWorkflow";

const RESULTS_FINALIZED_INDEX = CEREMONY_LIFECYCLE.indexOf("COMPLETE");

/**
 * Results are final once the draft is completed and the ceremony has reached
 * COMPLETE or any later lifecycle state (so archiving never hides them).
 */
export function isFinalResults(args: {
  draftStatus: string | null | undefined;
  ceremonyStatus: string | null | undefined;
}): boolean {
  if (args.draftStatus !== "COMPLETED") return false;
  const index = CEREMONY_LIFECYCLE.findIndex((s) => s === args.ceremonyStatus);
  return index >= RESULTS_FINALIZED_INDEX;
}
