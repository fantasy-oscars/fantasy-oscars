import type { Snapshot } from "../../lib/types";

export function mapPickError(code?: string, fallback?: string) {
  switch (code) {
    case "NOT_ACTIVE_TURN":
      return "It is not your turn. Wait for the active seat to pick.";
    case "NOMINATION_ALREADY_PICKED":
      return "That nomination is already picked. Choose another nomination.";
    case "DRAFT_NOT_IN_PROGRESS":
      return "Draft is not in progress. Refresh the draft state.";
    case "PREREQ_MISSING_SEATS":
      return "Draft has no seats configured. Ask the commissioner to set seats.";
    case "PREREQ_MISSING_NOMINATIONS":
      return "Nominees not loaded. Ask the commissioner to load nominees.";
    default:
      return fallback ?? "Pick failed. Please try again.";
  }
}

export function isIntegrityWarningWindow(
  startsAt?: string | null,
  nowMs: number = Date.now()
): boolean {
  if (!startsAt) return false;
  const startMs = new Date(startsAt).getTime();
  if (!Number.isFinite(startMs)) return false;
  const windowStart = startMs - 24 * 60 * 60 * 1000;
  return nowMs >= windowStart && nowMs < startMs;
}

export function formatTimer(draft: Snapshot["draft"], nowMs: number) {
  if (!draft.pick_timer_seconds) return "Off";
  if (draft.status === "PENDING") return "Not started";
  if (draft.status === "PAUSED") return "Paused";
  if (draft.status === "COMPLETED") return "Draft complete";
  if (draft.status !== "IN_PROGRESS") return "—";
  const deadline = draft.pick_deadline_at
    ? new Date(draft.pick_deadline_at).getTime()
    : null;
  if (!deadline) return `${draft.pick_timer_seconds}s (no deadline set)`;
  const remaining = Math.max(0, deadline - nowMs);
  const seconds = Math.round(remaining / 1000);
  return `${draft.pick_timer_seconds}s • ${seconds}s left`;
}
