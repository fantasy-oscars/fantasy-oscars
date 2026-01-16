export const draftStates = [
  "PENDING",
  "IN_PROGRESS",
  "PAUSED",
  "COMPLETED",
  "CANCELLED"
] as const;
export type DraftState = (typeof draftStates)[number];

export type DraftStateTransition = {
  from: DraftState;
  to: DraftState;
};

const allowedTransitions: DraftStateTransition[] = [
  { from: "PENDING", to: "IN_PROGRESS" },
  { from: "IN_PROGRESS", to: "PAUSED" },
  { from: "PAUSED", to: "IN_PROGRESS" },
  { from: "IN_PROGRESS", to: "COMPLETED" },
  { from: "IN_PROGRESS", to: "CANCELLED" },
  { from: "PAUSED", to: "CANCELLED" },
  { from: "PENDING", to: "CANCELLED" }
];

export type DraftStateErrorCode =
  | "INVALID_TRANSITION"
  | "UNKNOWN_STATE"
  | "SAME_STATE"
  | "TRANSITION_NOT_ALLOWED";

export class DraftStateError extends Error {
  constructor(
    message: string,
    public code: DraftStateErrorCode,
    public details?: { from?: string; to?: string }
  ) {
    super(message);
    this.name = "DraftStateError";
  }
}

export function isValidDraftState(state: string): state is DraftState {
  return (draftStates as readonly string[]).includes(state);
}

export function validateDraftTransition(from: string, to: string) {
  if (!isValidDraftState(from)) {
    throw new DraftStateError("Unknown from state", "UNKNOWN_STATE", { from, to });
  }
  if (!isValidDraftState(to)) {
    throw new DraftStateError("Unknown to state", "UNKNOWN_STATE", { from, to });
  }
  if (from === to) {
    throw new DraftStateError("No-op transition", "SAME_STATE", { from, to });
  }

  const allowed = allowedTransitions.some((t) => t.from === from && t.to === to);
  if (!allowed) {
    throw new DraftStateError("Transition not allowed", "TRANSITION_NOT_ALLOWED", {
      from,
      to
    });
  }
}

export function enforceDraftTransition(from: string, to: string): DraftState {
  validateDraftTransition(from, to);
  return to as DraftState;
}

export function getAllowedTransitionsFrom(from: string): DraftState[] {
  if (!isValidDraftState(from)) {
    throw new DraftStateError("Unknown from state", "UNKNOWN_STATE", { from });
  }
  return allowedTransitions.filter((t) => t.from === from).map((t) => t.to);
}
