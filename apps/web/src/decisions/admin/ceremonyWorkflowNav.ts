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

  // Structure and publish are only editable while in DRAFT.
  if (stepId === "structure") return ceremonyStatus === "DRAFT";
  if (stepId === "publish") return ceremonyStatus === "DRAFT";

  return true;
}
