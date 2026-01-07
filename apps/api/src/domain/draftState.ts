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

function isDraftStateError(err: unknown): err is DraftStateError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "message" in err &&
    "details" in err
  );
}

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
  if (isDraftStateError(error)) {
    return { code: error.code, message: error.message, details: error.details };
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return {
      code: "INTERNAL_ERROR",
      message: String((error as { message: unknown }).message),
      details: {}
    };
  }
  return undefined;
}

export function applyDraftStateTransition(
  draft: DraftRecord,
  to: DraftState,
  now: Clock = defaultClock
): DraftRecord {
  return transitionDraftState(draft, to, now);
}
