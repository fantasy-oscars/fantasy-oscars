import { isCeremonyContentEditable } from "../ceremonyLifecycle";
import type { CeremonyStatus, CeremonyWorkflowStepId } from "../ceremonyWorkflow";

export function isCeremonyWorkflowStepAllowed(args: {
  stepId: CeremonyWorkflowStepId;
  ceremonyStatus: CeremonyStatus;
}): boolean {
  const { stepId, ceremonyStatus } = args;

  // Archive is intentionally demoted to a separate section on the worksheet.
  if (stepId === "archive") return false;

  // Results are only meaningful once the ceremony is no longer in DRAFT.
  if (stepId === "results") return ceremonyStatus !== "DRAFT";

  // Categories stay editable until the ceremony opens for leagues.
  if (stepId === "structure") return isCeremonyContentEditable(ceremonyStatus);
  if (stepId === "publish") return ceremonyStatus === "DRAFT";
  if (stepId === "open") return ceremonyStatus === "PUBLISHED";

  return true;
}
