import { DraftState } from "@fantasy-oscars/shared";

export type LeagueMembershipGuard = {
  draft_status: DraftState;
};

export class LeagueMembershipError extends Error {
  constructor(
    message: string,
    public code: "JOIN_LOCKED"
  ) {
    super(message);
    this.name = "LeagueMembershipError";
  }
}

export function ensureJoinAllowed(guard: LeagueMembershipGuard) {
  if (guard.draft_status !== "PENDING") {
    throw new LeagueMembershipError("Cannot join after draft start", "JOIN_LOCKED");
  }
}
