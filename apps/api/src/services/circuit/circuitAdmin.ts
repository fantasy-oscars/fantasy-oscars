import type { Pool } from "pg";
import { type DbClient, runInTransaction } from "../../data/db.js";
import { updateCeremonyDates } from "../../data/repositories/ceremonyRepository.js";
import {
  activateCircuit,
  deleteCircuitMapping,
  getCategoryEditionCeremonyId,
  getCeremonySummary,
  getCircuitCategory,
  insertCircuit,
  isCeremonyInCircuit,
  listCeremonyCircuitAssociations,
  listCircuitCategories,
  listCircuitCategoryEditions,
  listCircuitCeremonies,
  listCircuitEvents,
  listCircuitEventsForCircuits,
  listCircuits,
  upsertCircuitMapping,
  type CircuitRow
} from "../../data/repositories/circuitRepository.js";
import {
  findCeremoniesMissingDates,
  listScoringOccasions,
  suggestCircuitCategoryId
} from "../../domain/circuit.js";
import { AppError, validationError } from "../../errors.js";
import {
  type Actor,
  audit,
  lockEditableCircuit,
  requireCircuit
} from "./circuitGuards.js";

/*
 * Circuit lifecycle, reads for the admin screens, mappings and ceremony dates.
 * Events and ceremony associations are in circuitEvents.ts; categories are in
 * circuitCategories.ts.
 */

export async function listCircuitsForAdmin(client: DbClient) {
  return listCircuits(client);
}

/** A new Circuit starts empty: admins add its ceremonies, events and categories. */
export async function createCircuit(
  pool: Pool,
  actor: Actor,
  input: { code: string; name: string; opens_on: string | null | undefined }
) {
  let circuit: CircuitRow;
  try {
    circuit = await insertCircuit(pool, { ...input, opens_on: input.opens_on ?? null });
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      throw validationError("Circuit code already exists", ["code"]);
    }
    throw err;
  }
  await audit(pool, actor, {
    action: "create_circuit",
    target_id: circuit.id,
    meta: { code: circuit.code }
  });
  return getCircuitDetail(pool, circuit.id);
}

export async function getCircuitDetail(client: DbClient, id: number) {
  const circuit = await requireCircuit(client, id);
  const [events, categories, ceremonies, categoryEditions] = await Promise.all([
    listCircuitEvents(client, id),
    listCircuitCategories(client, id),
    listCircuitCeremonies(client, id),
    listCircuitCategoryEditions(client, id)
  ]);
  return {
    circuit,
    events,
    categories,
    ceremonies,
    // The suggestion pre-selects a Circuit category on the mapping screen;
    // only an explicit save creates a mapping.
    category_editions: categoryEditions.map((e) => ({
      ...e,
      suggested_circuit_category_id: suggestCircuitCategoryId(e.family_id, categories)
    })),
    readiness: { missing_dates: findCeremoniesMissingDates(ceremonies) },
    occasions: listScoringOccasions(ceremonies)
  };
}

/** The ceremony side of the shared association, plus the Circuits it can join. */
export async function getCeremonyCircuits(client: DbClient, ceremonyId: number) {
  if (!(await getCeremonySummary(client, ceremonyId))) {
    throw new AppError("NOT_FOUND", 404, "Ceremony not found");
  }
  const associations = await listCeremonyCircuitAssociations(client, ceremonyId);
  const options = await listCircuits(client, { excludeStatuses: ["ARCHIVED"] });
  const events = await listCircuitEventsForCircuits(
    client,
    options.map((c) => c.id)
  );
  return {
    associations,
    circuits: options.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      status: c.status,
      events: events.filter((e) => e.circuit_id === c.id)
    }))
  };
}

/**
 * Maps a ceremony category to a Circuit category, replacing its earlier
 * mapping. Any number of ceremony categories, of one ceremony or several, may
 * map to the same Circuit category.
 */
export async function setMapping(
  pool: Pool,
  actor: Actor,
  input: { circuitId: number; categoryEditionId: number; circuitCategoryId: number }
) {
  const { circuit, category } = await runInTransaction(pool, async (tx) => {
    const circuit = await lockEditableCircuit(tx, input.circuitId);
    const ceremonyId = await getCategoryEditionCeremonyId(tx, input.categoryEditionId);
    if (ceremonyId === null) throw new AppError("NOT_FOUND", 404, "Category not found");
    if (!(await isCeremonyInCircuit(tx, input.circuitId, ceremonyId))) {
      throw new AppError(
        "CIRCUIT_CEREMONY_NOT_ASSOCIATED",
        409,
        "Add this category's ceremony to the Circuit before mapping it",
        { ceremony_id: ceremonyId }
      );
    }
    const category = await getCircuitCategory(
      tx,
      input.circuitId,
      input.circuitCategoryId
    );
    if (!category) {
      throw validationError("Choose a category in this Circuit", ["circuit_category_id"]);
    }
    await upsertCircuitMapping(tx, input);
    return { circuit, category };
  });
  await audit(pool, actor, {
    action: "set_circuit_mapping",
    target_id: input.circuitId,
    meta: {
      category_edition_id: input.categoryEditionId,
      circuit_category_id: input.circuitCategoryId,
      category_code: category.code,
      circuit_status: circuit.status
    }
  });
  return {
    mapping: {
      circuit_id: input.circuitId,
      category_edition_id: input.categoryEditionId,
      circuit_category_id: input.circuitCategoryId
    }
  };
}

export async function removeMapping(
  pool: Pool,
  actor: Actor,
  input: { circuitId: number; categoryEditionId: number }
) {
  const circuit = await runInTransaction(pool, async (tx) => {
    const circuit = await lockEditableCircuit(tx, input.circuitId);
    if (!(await deleteCircuitMapping(tx, input.circuitId, input.categoryEditionId))) {
      throw new AppError("NOT_FOUND", 404, "This category is not mapped");
    }
    return circuit;
  });
  await audit(pool, actor, {
    action: "remove_circuit_mapping",
    target_id: input.circuitId,
    meta: { category_edition_id: input.categoryEditionId, circuit_status: circuit.status }
  });
}

/**
 * DRAFT → ACTIVE. The readiness check is soft: activation always proceeds and
 * the response lists the associated ceremonies that still lack a date.
 */
export async function activate(pool: Pool, actor: Actor, circuitId: number) {
  const current = await requireCircuit(pool, circuitId);
  const circuit = await activateCircuit(pool, circuitId);
  if (!circuit) {
    throw new AppError(
      "CIRCUIT_NOT_DRAFT",
      409,
      "Only a draft Circuit can be activated",
      { status: current.status }
    );
  }
  const missing = findCeremoniesMissingDates(
    await listCircuitCeremonies(pool, circuitId)
  );
  await audit(pool, actor, {
    action: "activate_circuit",
    target_id: circuitId,
    meta: { missing_dates_ceremony_ids: missing.map((m) => m.ceremony_id) }
  });
  return { circuit, readiness: { missing_dates: missing } };
}

/** Dates are routine content: editable at any ceremony status, never touching Circuit status. */
export async function setCeremonyDates(
  pool: Pool,
  actor: Actor,
  ceremonyId: number,
  dates: { nominations_on?: string | null; results_on?: string | null }
) {
  const ceremony = await updateCeremonyDates(pool, ceremonyId, dates);
  if (!ceremony) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
  await audit(pool, actor, {
    action: "update_ceremony_dates",
    target_type: "ceremony",
    target_id: ceremonyId,
    meta: {
      fields: Object.keys(dates).filter(
        (k) => dates[k as keyof typeof dates] !== undefined
      ),
      nominations_on: ceremony.nominations_on,
      results_on: ceremony.results_on
    }
  });
  return { ceremony };
}
