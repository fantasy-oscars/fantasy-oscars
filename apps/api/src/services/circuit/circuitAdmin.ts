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
  listInitializedCircuitLeagues,
  upsertCircuitMapping,
  type CircuitRow
} from "../../data/repositories/circuitRepository.js";
import {
  findCeremoniesMissingDates,
  listScoringOccasions,
  resultsDateOf,
  suggestCircuitCategoryId,
  withResultsDate
} from "../../domain/circuit.js";
import {
  categoryIconGaps,
  circuitCoverage,
  isCircuitReady,
  readinessGaps
} from "../../domain/circuitReadiness.js";
import { waiverWindows } from "../../domain/waiverWindows.js";
import { AppError, validationError } from "../../errors.js";
import {
  type Actor,
  assertStructuralEditConfirmed,
  audit,
  lockEditableCircuit,
  requireCircuit
} from "./circuitGuards.js";
import { rebuildCircuitScoresAfterWrite } from "./circuitScoring.js";
import { announceCircuitStatus, announceScheduleChange } from "./circuitSchedule.js";

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
  const [events, categories, ceremonies, categoryEditions, initializedLeagues] =
    await Promise.all([
      listCircuitEvents(client, id),
      listCircuitCategories(client, id),
      listCircuitCeremonies(client, id),
      listCircuitCategoryEditions(client, id),
      listInitializedCircuitLeagues(client, id)
    ]);
  const occasions = listScoringOccasions(ceremonies);
  return {
    circuit,
    events,
    categories,
    ceremonies: ceremonies.map(withResultsDate),
    // The suggestion pre-selects a Circuit category on the mapping screen;
    // only an explicit save creates a mapping.
    category_editions: categoryEditions.map((e) => ({
      ...e,
      suggested_circuit_category_id: suggestCircuitCategoryId(e.family_id, categories)
    })),
    readiness: { missing_dates: findCeremoniesMissingDates(ceremonies) },
    // The leagues a structural edit would affect; the screens name them when
    // they ask the admin to confirm.
    initialized_leagues: initializedLeagues.map((l) => ({
      circuit_league_id: l.circuit_league_id,
      league_id: l.league_id,
      name: l.league_name,
      status: l.status
    })),
    occasions,
    // As if every ceremony were enabled: a league that disables some
    // ceremonies has fewer scoring days, and so fewer windows.
    waiver_windows: waiverWindows(
      occasions.flatMap((o) => (o.date === null ? [] : [o.date]))
    )
  };
}

/**
 * What an admin still has to do before the Circuit can score, and what each
 * ceremony supplies: missing dates, ceremonies and categories with no
 * mappings, the editions left unmapped, and the dated schedule (every
 * occasion, and the windows as if every ceremony were enabled).
 */
export async function getCircuitReadiness(client: DbClient, id: number) {
  const circuit = await requireCircuit(client, id);
  const [categories, ceremonies, categoryEditions] = await Promise.all([
    listCircuitCategories(client, id),
    listCircuitCeremonies(client, id),
    listCircuitCategoryEditions(client, id)
  ]);
  const coverage = circuitCoverage(ceremonies, categories, categoryEditions);
  const gaps = readinessGaps(coverage, findCeremoniesMissingDates(ceremonies));
  const occasions = listScoringOccasions(ceremonies);
  return {
    circuit: {
      id: circuit.id,
      code: circuit.code,
      name: circuit.name,
      status: circuit.status
    },
    ready: isCircuitReady(ceremonies.length, gaps),
    gaps: { ...gaps, ...categoryIconGaps(categories) },
    coverage,
    occasions,
    waiver_windows: waiverWindows(
      occasions.flatMap((o) => (o.date === null ? [] : [o.date]))
    )
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
  input: {
    circuitId: number;
    categoryEditionId: number;
    circuitCategoryId: number;
    confirmed?: boolean;
  }
) {
  const { circuit, category, ceremonyId, confirmedLeagues } = await runInTransaction(
    pool,
    async (tx) => {
      const circuit = await lockEditableCircuit(tx, input.circuitId);
      const confirmedLeagues = await assertStructuralEditConfirmed(
        tx,
        input.circuitId,
        input.confirmed ?? false
      );
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
        throw validationError("Choose a category in this Circuit", [
          "circuit_category_id"
        ]);
      }
      await upsertCircuitMapping(tx, input);
      return { circuit, category, ceremonyId, confirmedLeagues };
    }
  );
  await audit(pool, actor, {
    action: "set_circuit_mapping",
    target_id: input.circuitId,
    meta: {
      category_edition_id: input.categoryEditionId,
      circuit_category_id: input.circuitCategoryId,
      category_code: category.code,
      circuit_status: circuit.status,
      confirmed_circuit_league_ids: confirmedLeagues
    }
  });
  await rebuildCircuitScoresAfterWrite(
    pool,
    { circuitId: input.circuitId, ceremonyId },
    "set_circuit_mapping"
  );
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
  input: { circuitId: number; categoryEditionId: number; confirmed?: boolean }
) {
  const { circuit, ceremonyId, confirmedLeagues } = await runInTransaction(
    pool,
    async (tx) => {
      const circuit = await lockEditableCircuit(tx, input.circuitId);
      const confirmedLeagues = await assertStructuralEditConfirmed(
        tx,
        input.circuitId,
        input.confirmed ?? false
      );
      const ceremonyId = await getCategoryEditionCeremonyId(tx, input.categoryEditionId);
      if (!(await deleteCircuitMapping(tx, input.circuitId, input.categoryEditionId))) {
        throw new AppError("NOT_FOUND", 404, "This category is not mapped");
      }
      return { circuit, ceremonyId, confirmedLeagues };
    }
  );
  await audit(pool, actor, {
    action: "remove_circuit_mapping",
    target_id: input.circuitId,
    meta: {
      category_edition_id: input.categoryEditionId,
      circuit_status: circuit.status,
      confirmed_circuit_league_ids: confirmedLeagues
    }
  });
  await rebuildCircuitScoresAfterWrite(
    pool,
    ceremonyId === null
      ? { circuitId: input.circuitId }
      : { circuitId: input.circuitId, ceremonyId },
    "remove_circuit_mapping"
  );
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
  await announceCircuitStatus(pool, circuitId, circuit.status);
  return { circuit, readiness: { missing_dates: missing } };
}

/**
 * The nominations date is routine content: editable at any ceremony status,
 * never touching Circuit status. The results date is derived from starts_at.
 */
export async function setCeremonyDates(
  pool: Pool,
  actor: Actor,
  ceremonyId: number,
  dates: { nominations_on: string | null }
) {
  const ceremony = await updateCeremonyDates(pool, ceremonyId, dates);
  if (!ceremony) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
  await audit(pool, actor, {
    action: "update_ceremony_dates",
    target_type: "ceremony",
    target_id: ceremonyId,
    meta: { fields: ["nominations_on"], nominations_on: ceremony.nominations_on }
  });
  await rebuildCircuitScoresAfterWrite(
    pool,
    { ceremonyId, kinds: ["NOMINATION"] },
    "update_ceremony_dates"
  );
  await announceScheduleChange(pool, { ceremonyId }, "update_ceremony_dates");
  return {
    ceremony: {
      id: ceremony.id,
      status: ceremony.status,
      nominations_on: ceremony.nominations_on,
      results_on: resultsDateOf(ceremony.starts_at)
    }
  };
}
