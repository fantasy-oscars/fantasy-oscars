import {
  DraftState,
  DraftStateError,
  enforceDraftTransition,
  getAllowedTransitionsFrom
} from "@fantasy-oscars/shared";

export type DraftRecord = {
  id: number;
  status: DraftState;
  started_at?: Date | null;
  completed_at?: Date | null;
};

type Clock = () => Date;

const defaultClock: Clock = () => new Date();

export function transitionDraftState(
  draft: DraftRecord,
  to: DraftState,
  now: Clock = defaultClock
): DraftRecord {
  const next = enforceDraftTransition(draft.status, to);

  const started_at =
    next === "IN_PROGRESS"
      ? (draft.started_at ?? now())
      : draft.status === "IN_PROGRESS"
        ? (draft.started_at ?? null)
        : (draft.started_at ?? null);

  const completed_at =
    next === "COMPLETED"
      ? now()
      : next === "CANCELLED"
        ? now()
        : (draft.completed_at ?? null);

  return {
    ...draft,
    status: next,
    started_at,
    completed_at
  };
}

export function allowedTransitions(status: DraftState): DraftState[] {
  return getAllowedTransitionsFrom(status);
}

export function mapDraftStateError(error: unknown) {
  if (error instanceof DraftStateError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  return undefined;
}

/**
 * Placeholder for integrating state enforcement into mutation flows.
 * When draft mutations are implemented, call `transitionDraftState` before persisting.
 */
export function applyDraftStateTransition(draftId: number, to: DraftState) {
  throw new DraftStateError("Not implemented in API layer", "INVALID_TRANSITION", {
    from: undefined,
    to
  });
}
