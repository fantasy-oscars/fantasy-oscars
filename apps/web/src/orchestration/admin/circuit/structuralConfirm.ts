import { confirm } from "../../../notifications";
import { needsStructuralEditConfirm } from "../../../decisions/admin/circuit";

/**
 * Resolves true when a structural edit may go ahead: immediately for a draft
 * Circuit, after the admin confirms for an ACTIVE one.
 */
export async function confirmStructuralEdit(args: {
  circuitStatus: string;
  circuitName: string;
  action: string;
}): Promise<boolean> {
  if (!needsStructuralEditConfirm(args.circuitStatus)) return true;
  return confirm({
    title: "Change an active Circuit?",
    message: `${args.circuitName} is active. ${args.action} changes how it is scored, and the change is recorded in the audit log.`,
    confirmLabel: "Make change"
  });
}
