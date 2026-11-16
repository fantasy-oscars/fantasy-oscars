import { confirm } from "../../../notifications";
import { needsStructuralEditConfirm } from "../../../decisions/admin/series";

/**
 * Resolves true when a structural edit may go ahead: immediately for a draft
 * Series, after the admin confirms for an ACTIVE one.
 */
export async function confirmStructuralEdit(args: {
  seriesStatus: string;
  seriesName: string;
  action: string;
}): Promise<boolean> {
  if (!needsStructuralEditConfirm(args.seriesStatus)) return true;
  return confirm({
    title: "Change an active Series?",
    message: `${args.seriesName} is active. ${args.action} changes how it is scored, and the change is recorded in the audit log.`,
    confirmLabel: "Make change"
  });
}
