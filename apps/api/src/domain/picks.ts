export type DraftPick = {
  pick_number: number;
  seat_number: number;
  round_number: number;
  nomination_id: string;
};

export type PickOperation =
  | { kind: "create"; pick: DraftPick }
  | { kind: "update"; pick: DraftPick }
  | { kind: "delete" };

export class DraftPickError extends Error {
  constructor(
    message: string,
    public code: "PICK_IMMUTABLE" | "UNSUPPORTED_OPERATION"
  ) {
    super(message);
    this.name = "DraftPickError";
  }
}

/**
 * Enforces the v1 invariant that picks are append-only:
 * - Only creation of a new pick in an empty slot is allowed.
 * - Any attempt to change or delete an existing pick is rejected.
 */
export function applyPickOperation(
  existingPick: DraftPick | null,
  op: PickOperation
): DraftPick {
  if (op.kind === "create") {
    if (existingPick) {
      throw new DraftPickError("Pick already recorded and immutable", "PICK_IMMUTABLE");
    }
    return op.pick;
  }

  if (op.kind === "update" || op.kind === "delete") {
    throw new DraftPickError(
      "Pick modifications are not allowed in v1",
      "PICK_IMMUTABLE"
    );
  }

  throw new DraftPickError("Unsupported pick operation", "UNSUPPORTED_OPERATION");
}
