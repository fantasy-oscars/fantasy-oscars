// Ordered ceremony lifecycle; later entries come after earlier ones.
export {
  ceremonyStatuses as CEREMONY_LIFECYCLE,
  isCeremonyContentEditable,
  isCeremonyStatus,
  type CeremonyStatus
} from "@fantasy-oscars/shared";

/**
 * Archive needs finalized results on a locked ceremony; the API refuses it otherwise.
 */
export function canArchiveCeremony(args: {
  status: string | null | undefined;
  resultsFinalizedAt: string | null | undefined;
}): boolean {
  return args.status === "LOCKED" && Boolean(args.resultsFinalizedAt);
}

/**
 * Withdraw returns a published ceremony to draft. The API refuses it while
 * any season is set up for the ceremony.
 */
export function canWithdrawCeremony(status: string | null | undefined): boolean {
  return status === "PUBLISHED";
}
