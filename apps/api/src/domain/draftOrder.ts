import { DraftState, DraftStateError, getSnakeSeatForPick } from "@fantasy-oscars/shared";

type SnakeOrderInput = {
  draft_order_type: "SNAKE" | "LINEAR";
  seat_count: number;
  pick_number: number;
  status: DraftState;
};

export type DraftOrderErrorCode = "INVALID_INPUT" | "INVALID_STATE";

export class DraftOrderError extends Error {
  constructor(
    message: string,
    public code: DraftOrderErrorCode,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "DraftOrderError";
  }
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function isDraftStateError(err: unknown): err is DraftStateError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "message" in err &&
    "details" in err
  );
}

export function computeSeatForPick(input: SnakeOrderInput): number {
  if (input.draft_order_type !== "SNAKE") {
    throw new DraftOrderError("Only snake ordering is supported", "INVALID_INPUT", {
      draft_order_type: input.draft_order_type
    });
  }
  if (input.status !== "IN_PROGRESS") {
    throw new DraftOrderError(
      "Draft must be in progress to compute picks",
      "INVALID_STATE",
      {
        status: input.status
      }
    );
  }
  try {
    return getSnakeSeatForPick(input.seat_count, input.pick_number);
  } catch (err: unknown) {
    if (isDraftStateError(err)) {
      throw new DraftOrderError(err.message, "INVALID_INPUT", err.details);
    }
    const normalized = toError(err);
    throw new DraftOrderError(normalized.message, "INVALID_INPUT");
  }
}

export function computePickAssignment(input: SnakeOrderInput) {
  const seat_number = computeSeatForPick(input);
  const round_number = Math.ceil(input.pick_number / input.seat_count);
  return { seat_number, round_number };
}
