import type { Pool } from "pg";
import { type DbClient, runInTransaction } from "../../data/db.js";
import {
  deleteCircuitCeremony,
  deleteCircuitEvent,
  deleteCircuitEventIfEmpty,
  getCeremonySummary,
  getCircuitCeremonyEventId,
  getCircuitEvent,
  insertCircuitEvent,
  listCeremonyCircuitAssociations,
  listCircuitCodes,
  listCircuitEvents,
  listCircuitCeremonies,
  listEventCeremonyIds,
  reorderCircuitRows,
  reorderEventCeremonies,
  updateCircuitEvent,
  upsertCircuitCeremony,
  type CeremonySummary,
  type CircuitEventRow
} from "../../data/repositories/circuitRepository.js";
import {
  codeFromLabel,
  isFullOrdering,
  moveToIndex,
  uniqueCode,
  withResultsDate
} from "../../domain/circuit.js";
import { AppError, validationError } from "../../errors.js";
import { type Actor, audit, lockEditableCircuit } from "./circuitGuards.js";

/*
 * Events and ceremony associations. An event is what leagues enable and
 * weight as one unit, and every associated ceremony belongs to exactly one
 * event of its Circuit (ADR 0006). An event is either a group, made by an
 * admin, which may be empty and stays when emptied, or a one-ceremony event
 * created for a single ceremony and deleted in the same transaction once the
 * ceremony leaves it (ADR 0007).
 */

type Via = { via: "circuit" | "ceremony" };

function ceremonyLabel(ceremony: CeremonySummary) {
  return ceremony.name?.trim() || ceremony.code?.trim() || `Ceremony ${ceremony.id}`;
}

/** A new one-ceremony event, named after the ceremony, at the end of the order. */
async function insertOwnEvent(
  tx: DbClient,
  circuitId: number,
  ceremony: CeremonySummary
) {
  const taken = await listCircuitCodes(tx, "circuit_event", circuitId);
  const label = ceremonyLabel(ceremony);
  return insertCircuitEvent(tx, {
    circuitId,
    code: uniqueCode(codeFromLabel(ceremony.code ?? label), taken, "event"),
    name: label,
    isGroup: false
  });
}

async function requireEvent(tx: DbClient, circuitId: number, eventId: number) {
  const event = await getCircuitEvent(tx, circuitId, eventId);
  if (!event) throw new AppError("NOT_FOUND", 404, "Event not found");
  return event;
}

/** Rejects a code already used by another event of the Circuit (ignoring case). */
async function assertEventCodeFree(
  tx: DbClient,
  circuitId: number,
  code: string,
  ownCode?: string
) {
  const taken = (await listCircuitCodes(tx, "circuit_event", circuitId))
    .filter((c) => c !== ownCode)
    .map((c) => c.toLowerCase());
  if (taken.includes(code.toLowerCase())) {
    throw validationError("Event code already exists in this Circuit", ["code"]);
  }
}

/**
 * Adds a ceremony (any ceremony) to a Circuit, or moves it into a group.
 * Without a group the ceremony gets its own one-ceremony event, appended to
 * the top level; a ceremony that already has one keeps it. Both admin screens
 * call this.
 */
export async function associateCeremony(
  pool: Pool,
  actor: Actor & Via,
  input: { circuitId: number; ceremonyId: number; circuitEventId: number | null }
) {
  const result = await runInTransaction(pool, async (tx) => {
    const circuit = await lockEditableCircuit(tx, input.circuitId);
    const ceremony = await getCeremonySummary(tx, input.ceremonyId);
    if (!ceremony) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
    const previous = await getCircuitCeremonyEventId(
      tx,
      input.circuitId,
      input.ceremonyId
    );

    let target: CircuitEventRow;
    let createdEventId: number | null = null;
    if (input.circuitEventId !== null) {
      const event = await getCircuitEvent(tx, input.circuitId, input.circuitEventId);
      // Another ceremony's one-ceremony event is not a destination.
      if (!event || (!event.is_group && event.id !== previous)) {
        throw validationError("Choose a group in this Circuit", ["circuit_event_id"]);
      }
      target = event;
    } else if (
      previous !== null &&
      !(await requireEvent(tx, input.circuitId, previous)).is_group
    ) {
      target = await requireEvent(tx, input.circuitId, previous);
    } else {
      target = await insertOwnEvent(tx, input.circuitId, ceremony);
      createdEventId = target.id;
    }

    await upsertCircuitCeremony(tx, {
      circuitId: input.circuitId,
      ceremonyId: input.ceremonyId,
      circuitEventId: target.id
    });
    const deletedEventId =
      previous !== null &&
      previous !== target.id &&
      (await deleteCircuitEventIfEmpty(tx, input.circuitId, previous))
        ? previous
        : null;
    return { circuit, target, previous, createdEventId, deletedEventId };
  });

  await audit(pool, actor, {
    action: "associate_circuit_ceremony",
    target_id: input.circuitId,
    meta: {
      ceremony_id: input.ceremonyId,
      circuit_event_id: result.target.id,
      event_code: result.target.code,
      previous_event_id: result.previous,
      created_event_id: result.createdEventId,
      deleted_event_id: result.deletedEventId,
      circuit_status: result.circuit.status,
      via: actor.via
    }
  });
  return {
    created: result.previous === null,
    circuit_event_id: result.target.id,
    associations: await listCeremonyCircuitAssociations(pool, input.ceremonyId)
  };
}

/** Removes a ceremony, its mappings in this Circuit, and its event if now empty. */
export async function removeCeremony(
  pool: Pool,
  actor: Actor & Via,
  input: { circuitId: number; ceremonyId: number }
) {
  const result = await runInTransaction(pool, async (tx) => {
    const circuit = await lockEditableCircuit(tx, input.circuitId);
    const eventId = await getCircuitCeremonyEventId(
      tx,
      input.circuitId,
      input.ceremonyId
    );
    const removed = await deleteCircuitCeremony(tx, input.circuitId, input.ceremonyId);
    if (!removed.removed || eventId === null) {
      throw new AppError("NOT_FOUND", 404, "This ceremony is not in the Circuit");
    }
    const eventDeleted = await deleteCircuitEventIfEmpty(tx, input.circuitId, eventId);
    return {
      circuit,
      mappings_removed: removed.mappings_removed,
      deleted_event_id: eventDeleted ? eventId : null
    };
  });
  await audit(pool, actor, {
    action: "remove_circuit_ceremony",
    target_id: input.circuitId,
    meta: {
      ceremony_id: input.ceremonyId,
      mappings_removed: result.mappings_removed,
      deleted_event_id: result.deleted_event_id,
      circuit_status: result.circuit.status,
      via: actor.via
    }
  });
  return { mappings_removed: result.mappings_removed };
}

/**
 * Creates a group, named by the admin, at the end of the order. Listed
 * ceremonies (already in the Circuit) move into it, and the one-ceremony
 * events they leave are deleted.
 */
export async function createEvent(
  pool: Pool,
  actor: Actor,
  input: { circuitId: number; name: string; code?: string; ceremonyIds: number[] }
) {
  const result = await runInTransaction(pool, async (tx) => {
    const circuit = await lockEditableCircuit(tx, input.circuitId);
    let code = input.code;
    if (code) {
      await assertEventCodeFree(tx, input.circuitId, code);
    } else {
      const taken = await listCircuitCodes(tx, "circuit_event", input.circuitId);
      code = uniqueCode(codeFromLabel(input.name), taken, "event");
    }
    const event = await insertCircuitEvent(tx, {
      circuitId: input.circuitId,
      code,
      name: input.name,
      isGroup: true
    });
    const left = new Set<number>();
    for (const ceremonyId of input.ceremonyIds) {
      const previous = await getCircuitCeremonyEventId(tx, input.circuitId, ceremonyId);
      if (previous === null) {
        throw validationError("Add each ceremony to this Circuit before grouping it", [
          "ceremony_ids"
        ]);
      }
      await upsertCircuitCeremony(tx, {
        circuitId: input.circuitId,
        ceremonyId,
        circuitEventId: event.id
      });
      left.add(previous);
    }
    const deleted: number[] = [];
    for (const eventId of left) {
      if (await deleteCircuitEventIfEmpty(tx, input.circuitId, eventId)) {
        deleted.push(eventId);
      }
    }
    return { circuit, event, deleted };
  });
  await audit(pool, actor, {
    action: "create_circuit_event",
    target_id: input.circuitId,
    meta: {
      circuit_event_id: result.event.id,
      code: result.event.code,
      name: result.event.name,
      ceremony_ids: input.ceremonyIds,
      deleted_event_ids: result.deleted,
      circuit_status: result.circuit.status
    }
  });
  return { event: result.event };
}

export async function updateEvent(
  pool: Pool,
  actor: Actor,
  input: { circuitId: number; eventId: number; name?: string; code?: string }
) {
  const result = await runInTransaction(pool, async (tx) => {
    const circuit = await lockEditableCircuit(tx, input.circuitId);
    const before = await requireEvent(tx, input.circuitId, input.eventId);
    if (input.code)
      await assertEventCodeFree(tx, input.circuitId, input.code, before.code);
    const event = (await updateCircuitEvent(tx, input))!;
    return { circuit, before, event };
  });
  await audit(pool, actor, {
    action: "update_circuit_event",
    target_id: input.circuitId,
    meta: {
      circuit_event_id: input.eventId,
      name: result.event.name,
      code: result.event.code,
      previous_name: result.before.name,
      previous_code: result.before.code,
      circuit_status: result.circuit.status
    }
  });
  return { event: result.event };
}

export async function reorderEvents(
  pool: Pool,
  actor: Actor,
  input: { circuitId: number; eventIds: number[] }
) {
  const result = await runInTransaction(pool, async (tx) => {
    const circuit = await lockEditableCircuit(tx, input.circuitId);
    const current = await listCircuitEvents(tx, input.circuitId);
    if (
      !isFullOrdering(
        input.eventIds,
        current.map((e) => e.id)
      )
    ) {
      throw validationError("List every event of this Circuit once", ["event_ids"]);
    }
    await reorderCircuitRows(tx, "circuit_event", input.circuitId, input.eventIds);
    return { circuit, events: await listCircuitEvents(tx, input.circuitId) };
  });
  await audit(pool, actor, {
    action: "reorder_circuit_events",
    target_id: input.circuitId,
    meta: { event_ids: input.eventIds, circuit_status: result.circuit.status }
  });
  return { events: result.events };
}

/**
 * Deletes an event by ungrouping it: each of its ceremonies moves to its own
 * one-ceremony event, keeping its mappings. To drop a ceremony from the
 * Circuit, remove the ceremony instead.
 */
export async function deleteEvent(
  pool: Pool,
  actor: Actor,
  input: { circuitId: number; eventId: number }
) {
  const result = await runInTransaction(pool, async (tx) => {
    const circuit = await lockEditableCircuit(tx, input.circuitId);
    const event = await requireEvent(tx, input.circuitId, input.eventId);
    const ceremonyIds = await listEventCeremonyIds(tx, input.circuitId, input.eventId);
    // Deleting first frees the event's code for a ceremony that takes it back;
    // the cascade removes only the associations, which are re-created below.
    await deleteCircuitEvent(tx, input.circuitId, input.eventId);
    const ungrouped: Array<{ ceremony_id: number; circuit_event_id: number }> = [];
    for (const ceremonyId of ceremonyIds) {
      const ceremony = (await getCeremonySummary(tx, ceremonyId, {
        includeDeleted: true
      }))!;
      const own = await insertOwnEvent(tx, input.circuitId, ceremony);
      await upsertCircuitCeremony(tx, {
        circuitId: input.circuitId,
        ceremonyId,
        circuitEventId: own.id
      });
      ungrouped.push({ ceremony_id: ceremonyId, circuit_event_id: own.id });
    }
    return { circuit, event, ungrouped };
  });
  await audit(pool, actor, {
    action: "delete_circuit_event",
    target_id: input.circuitId,
    meta: {
      circuit_event_id: input.eventId,
      code: result.event.code,
      name: result.event.name,
      ungrouped: result.ungrouped,
      circuit_status: result.circuit.status
    }
  });
  return { ungrouped: result.ungrouped };
}

/**
 * Places an associated ceremony, the one write behind drag and drop. With a
 * group the ceremony moves into it at `index` among its ceremonies, and the
 * one-ceremony event it leaves is deleted. Without one it goes to the top
 * level at `index` among the Circuit's events (groups and single ceremonies
 * together), getting its own one-ceremony event when it leaves a group. An
 * index past the end appends.
 */
export async function moveCeremony(
  pool: Pool,
  actor: Actor,
  input: { circuitId: number; ceremonyId: number; groupId: number | null; index: number }
) {
  const result = await runInTransaction(pool, async (tx) => {
    const circuit = await lockEditableCircuit(tx, input.circuitId);
    const previous = await getCircuitCeremonyEventId(
      tx,
      input.circuitId,
      input.ceremonyId
    );
    if (previous === null) {
      throw new AppError("NOT_FOUND", 404, "This ceremony is not in the Circuit");
    }
    const previousEvent = await requireEvent(tx, input.circuitId, previous);

    let targetId: number;
    let createdEventId: number | null = null;
    let deletedEventId: number | null = null;
    if (input.groupId !== null) {
      const group = await getCircuitEvent(tx, input.circuitId, input.groupId);
      if (!group || !group.is_group) {
        throw validationError("Choose a group in this Circuit", ["group_id"]);
      }
      targetId = group.id;
      await upsertCircuitCeremony(tx, {
        circuitId: input.circuitId,
        ceremonyId: input.ceremonyId,
        circuitEventId: group.id
      });
      const order = moveToIndex(
        await listEventCeremonyIds(tx, input.circuitId, group.id),
        input.ceremonyId,
        input.index
      );
      await reorderEventCeremonies(tx, input.circuitId, group.id, order);
      if (
        previous !== group.id &&
        (await deleteCircuitEventIfEmpty(tx, input.circuitId, previous))
      ) {
        deletedEventId = previous;
      }
    } else {
      targetId = previous;
      if (previousEvent.is_group) {
        const ceremony = (await getCeremonySummary(tx, input.ceremonyId, {
          includeDeleted: true
        }))!;
        const own = await insertOwnEvent(tx, input.circuitId, ceremony);
        await upsertCircuitCeremony(tx, {
          circuitId: input.circuitId,
          ceremonyId: input.ceremonyId,
          circuitEventId: own.id
        });
        targetId = own.id;
        createdEventId = own.id;
      }
      // The index counts what the admin sees: groups and events with a
      // ceremony. An event left empty some other way keeps its place at the end.
      const events = await listCircuitEvents(tx, input.circuitId);
      const shown = new Set(
        (await listCircuitCeremonies(tx, input.circuitId)).map((c) => c.circuit_event_id)
      );
      const isShown = (e: CircuitEventRow) =>
        e.is_group || e.id === targetId || shown.has(e.id);
      const order = [
        ...moveToIndex(
          events.filter(isShown).map((e) => e.id),
          targetId,
          input.index
        ),
        ...events.filter((e) => !isShown(e)).map((e) => e.id)
      ];
      await reorderCircuitRows(tx, "circuit_event", input.circuitId, order);
    }
    return { circuit, previous, targetId, createdEventId, deletedEventId };
  });

  await audit(pool, actor, {
    action: "move_circuit_ceremony",
    target_id: input.circuitId,
    meta: {
      ceremony_id: input.ceremonyId,
      group_id: input.groupId,
      index: input.index,
      circuit_event_id: result.targetId,
      previous_event_id: result.previous,
      created_event_id: result.createdEventId,
      deleted_event_id: result.deletedEventId,
      circuit_status: result.circuit.status
    }
  });
  const [events, ceremonies] = await Promise.all([
    listCircuitEvents(pool, input.circuitId),
    listCircuitCeremonies(pool, input.circuitId)
  ]);
  return {
    circuit_event_id: result.targetId,
    events,
    ceremonies: ceremonies.map(withResultsDate)
  };
}

/** Orders the ceremonies inside one event, listing each of them once. */
export async function reorderEventCeremonyOrder(
  pool: Pool,
  actor: Actor,
  input: { circuitId: number; eventId: number; ceremonyIds: number[] }
) {
  const circuit = await runInTransaction(pool, async (tx) => {
    const circuit = await lockEditableCircuit(tx, input.circuitId);
    await requireEvent(tx, input.circuitId, input.eventId);
    const current = await listEventCeremonyIds(tx, input.circuitId, input.eventId);
    if (!isFullOrdering(input.ceremonyIds, current)) {
      throw validationError("List every ceremony of this group once", ["ceremony_ids"]);
    }
    await reorderEventCeremonies(tx, input.circuitId, input.eventId, input.ceremonyIds);
    return circuit;
  });
  await audit(pool, actor, {
    action: "reorder_circuit_event_ceremonies",
    target_id: input.circuitId,
    meta: {
      circuit_event_id: input.eventId,
      ceremony_ids: input.ceremonyIds,
      circuit_status: circuit.status
    }
  });
  return { ceremony_ids: input.ceremonyIds };
}
