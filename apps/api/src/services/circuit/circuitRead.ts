import type { DbClient } from "../../data/db.js";
import {
  getCircuitById,
  listCircuitCategories,
  listCircuitCeremonies,
  listCircuitEvents,
  listCircuits
} from "../../data/repositories/circuitRepository.js";
import { listScoringOccasions } from "../../domain/circuit.js";
import { AppError } from "../../errors.js";

/*
 * Public Circuit reads, with the admin-defined events and categories. A
 * Circuit in DRAFT is admin-only, like a draft ceremony, and so are
 * associated ceremonies still in DRAFT.
 */

async function requirePublicCircuit(client: DbClient, id: number) {
  const circuit = await getCircuitById(client, id);
  if (!circuit || circuit.status === "DRAFT") {
    throw new AppError("NOT_FOUND", 404, "Circuit not found");
  }
  return circuit;
}

function publicCircuit(circuit: Awaited<ReturnType<typeof requirePublicCircuit>>) {
  return {
    id: circuit.id,
    code: circuit.code,
    name: circuit.name,
    status: circuit.status,
    opens_on: circuit.opens_on,
    activated_at: circuit.activated_at
  };
}

export async function listPublicCircuits(client: DbClient) {
  const rows = await listCircuits(client, { excludeStatuses: ["DRAFT"] });
  return rows.map(publicCircuit);
}

export async function getPublicCircuit(client: DbClient, id: number) {
  const circuit = await requirePublicCircuit(client, id);
  const [events, categories] = await Promise.all([
    listCircuitEvents(client, id),
    listCircuitCategories(client, id)
  ]);
  return { circuit: publicCircuit(circuit), events, categories };
}

export async function getPublicCircuitEvents(client: DbClient, id: number) {
  await requirePublicCircuit(client, id);
  const [events, ceremonies] = await Promise.all([
    listCircuitEvents(client, id),
    listCircuitCeremonies(client, id, { publicOnly: true })
  ]);
  return {
    events: events.map((e) => ({
      ...e,
      ceremonies: ceremonies
        .filter((c) => c.circuit_event_id === e.id)
        .map((c) => ({
          id: c.ceremony_id,
          code: c.ceremony_code,
          name: c.ceremony_name,
          nominations_on: c.nominations_on,
          results_on: c.results_on
        }))
    }))
  };
}

export async function getPublicCircuitCategories(client: DbClient, id: number) {
  await requirePublicCircuit(client, id);
  return { categories: await listCircuitCategories(client, id) };
}

export async function getPublicCircuitSchedule(client: DbClient, id: number) {
  await requirePublicCircuit(client, id);
  const ceremonies = await listCircuitCeremonies(client, id, { publicOnly: true });
  return { occasions: listScoringOccasions(ceremonies) };
}
