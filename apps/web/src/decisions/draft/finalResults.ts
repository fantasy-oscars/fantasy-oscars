/**
 * Results are final once the draft is completed and the ceremony's winners have
 * been finalized. The timestamp stays set after archiving, so archiving never
 * hides them.
 */
export function isFinalResults(args: {
  draftStatus: string | null | undefined;
  resultsFinalizedAt: string | null | undefined;
}): boolean {
  if (args.draftStatus !== "COMPLETED") return false;
  return Boolean(args.resultsFinalizedAt);
}
