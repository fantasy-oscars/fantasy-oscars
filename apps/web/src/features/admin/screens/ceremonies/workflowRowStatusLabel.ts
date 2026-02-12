import type { CeremonyWorkflowStepStatus } from "@/decisions/ceremonyWorkflow";

export function workflowRowStatusLabel(args: {
  rowStatus: CeremonyWorkflowStepStatus;
  current: boolean;
}): string {
  const { rowStatus, current } = args;
  if (current) return "Current";
  if (rowStatus === "COMPLETE") return "Complete";
  if (rowStatus === "IN_PROGRESS") return "In progress";
  if (rowStatus === "LOCKED") return "Locked";
  return "Not started";
}

