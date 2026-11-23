import { confirm } from "../../../notifications";
import {
  needsStructuralEditConfirm,
  parseAffectedLeagues,
  structuralEditMessage,
  type AffectedLeague
} from "../../../decisions/admin/circuit";

/** The query that carries the admin's confirmation of a change to initialised leagues. */
export function confirmQuery(confirmed: boolean) {
  return confirmed ? "?confirm=true" : "";
}

/** The server's refusal of an edit that affects initialised leagues until confirmed. */
export const NEEDS_CONFIRMATION_CODE = "CIRCUIT_EDIT_NEEDS_CONFIRMATION";

/**
 * Resolves true when a structural edit may go ahead: immediately for a draft
 * Circuit, after the admin confirms for an ACTIVE one or one with initialised
 * leagues, which the message names.
 */
export async function confirmStructuralEdit(args: {
  circuitStatus: string;
  circuitName: string;
  action: string;
  leagues?: readonly AffectedLeague[];
}): Promise<boolean> {
  const leagues = args.leagues ?? [];
  if (!needsStructuralEditConfirm(args.circuitStatus, leagues.length)) return true;
  return confirm({
    title:
      leagues.length > 0
        ? "Change scoring for initialised leagues?"
        : "Change an active Circuit?",
    message: structuralEditMessage({
      circuitName: args.circuitName,
      action: args.action,
      leagues
    }),
    confirmLabel: "Make change"
  });
}

type WriteResult = {
  ok: boolean;
  errorCode?: string;
  errorDetails?: Record<string, unknown>;
};

/**
 * Runs a write that adds or removes a ceremony or changes a mapping. The
 * admin confirms first when the screen already knows the Circuit is active or
 * has initialised leagues. Otherwise the write is tried unconfirmed, and if
 * the server finds initialised leagues the admin is asked, with them named,
 * and it is sent again confirmed. Resolves null when the admin declines.
 */
export async function runStructuralWrite<R extends WriteResult>(args: {
  circuitStatus: string;
  circuitName: string;
  action: string;
  leagues?: readonly AffectedLeague[];
  run: (confirmed: boolean) => Promise<R>;
}): Promise<R | null> {
  const known = args.leagues ?? [];
  if (needsStructuralEditConfirm(args.circuitStatus, known.length)) {
    if (!(await confirmStructuralEdit(args))) return null;
    return args.run(true);
  }
  const first = await args.run(false);
  if (first.ok || first.errorCode !== NEEDS_CONFIRMATION_CODE) return first;
  const leagues = parseAffectedLeagues(first.errorDetails);
  if (!(await confirmStructuralEdit({ ...args, leagues }))) return null;
  return args.run(true);
}
