import type { DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import {
  getCircuitById,
  listInitializedCircuitLeagues,
  type CircuitRow
} from "../../data/repositories/circuitRepository.js";
import { AppError } from "../../errors.js";

/*
 * Shared checks for Circuit administration. Every write appends to
 * admin_audit_log after it commits, as the ceremony admin routes do.
 *
 * Structural edits (ceremonies, events, categories and mappings) stay allowed
 * after activation: owner question 6 was answered with the recommended "allow,
 * for admins only, audit-logged". Adding or removing a ceremony and changing a
 * mapping also change what initialised leagues score, so they need the admin's
 * confirmation once any league has initialised. Only an archived Circuit is
 * read-only.
 */

export type Actor = { actorUserId: number | null };

export async function audit(
  client: DbClient,
  actor: Actor,
  entry: { action: string; target_id: number; meta: object; target_type?: string }
) {
  if (actor.actorUserId === null) return;
  await insertAdminAudit(client, {
    actor_user_id: actor.actorUserId,
    action: entry.action,
    target_type: entry.target_type ?? "circuit",
    target_id: entry.target_id,
    meta: { ...entry.meta }
  });
}

export async function requireCircuit(client: DbClient, id: number): Promise<CircuitRow> {
  const circuit = await getCircuitById(client, id);
  if (!circuit) throw new AppError("NOT_FOUND", 404, "Circuit not found");
  return circuit;
}

/**
 * Locks the Circuit row for the rest of the transaction, so structural edits
 * to one Circuit run one at a time, and rejects an archived Circuit.
 */
export async function lockEditableCircuit(tx: DbClient, id: number): Promise<CircuitRow> {
  const circuit = await getCircuitById(tx, id, { forUpdate: true });
  if (!circuit) throw new AppError("NOT_FOUND", 404, "Circuit not found");
  if (circuit.status === "ARCHIVED") {
    throw new AppError("CIRCUIT_ARCHIVED", 409, "Archived Circuits are read-only");
  }
  return circuit;
}

/**
 * Adding or removing a ceremony, or changing a mapping, moves points in every
 * initialised league of the Circuit. Refuses unless the admin confirmed, and
 * names the leagues; returns their ids for the audit row.
 */
export async function assertStructuralEditConfirmed(
  tx: DbClient,
  circuitId: number,
  confirmed: boolean
): Promise<number[]> {
  const leagues = await listInitializedCircuitLeagues(tx, circuitId);
  if (leagues.length > 0 && !confirmed) {
    throw new AppError(
      "CIRCUIT_EDIT_NEEDS_CONFIRMATION",
      409,
      `This change affects ${leagues.length} initialised ${
        leagues.length === 1 ? "league" : "leagues"
      }. Confirm to continue.`,
      {
        affected_leagues: leagues.map((l) => ({
          circuit_league_id: l.circuit_league_id,
          league_id: l.league_id,
          name: l.league_name,
          status: l.status
        }))
      }
    );
  }
  return leagues.map((l) => l.circuit_league_id);
}
