/*
 * The Circuit editor's Ceremonies list (ADR 0007). Pure: no IO.
 *
 * The top level holds groups and single ceremonies together, in event order.
 * A single ceremony's own event is hidden plumbing: the list shows it as a
 * plain ceremony row. Groups are the events an admin made with Add group.
 */

export type CircuitLayoutItem =
  | { kind: "group"; eventId: number; ceremonyIds: number[] }
  | { kind: "single"; eventId: number; ceremonyId: number };

export type CircuitLayout = CircuitLayoutItem[];

/** The one write a drag or a move menu item sends. */
export type CircuitLayoutWrite =
  | { kind: "moveCeremony"; ceremonyId: number; groupId: number | null; index: number }
  | { kind: "reorderEvents"; eventIds: number[] };

/** The top-level list from the detail response's events and ceremonies. */
export function circuitLayout(
  events: ReadonlyArray<{ id: number; is_group: boolean }>,
  ceremonies: ReadonlyArray<{
    ceremony_id: number;
    circuit_event_id: number;
    sort_index: number;
  }>
): CircuitLayout {
  return events.flatMap((event): CircuitLayoutItem[] => {
    const rows = ceremonies
      .filter((c) => c.circuit_event_id === event.id)
      .sort((a, b) => a.sort_index - b.sort_index || a.ceremony_id - b.ceremony_id);
    if (event.is_group) {
      return [
        { kind: "group", eventId: event.id, ceremonyIds: rows.map((c) => c.ceremony_id) }
      ];
    }
    return rows.map((c) => ({
      kind: "single",
      eventId: event.id,
      ceremonyId: c.ceremony_id
    }));
  });
}

/*
 * Drag ids. A group is a sortable top-level item with a header and a body
 * that ceremonies can be dropped on; a ceremony row is sortable wherever it is.
 */
export const circuitDragId = {
  ceremony: (id: number) => `ceremony:${id}`,
  group: (eventId: number) => `group:${eventId}`,
  groupHead: (eventId: number) => `group-head:${eventId}`,
  groupBody: (eventId: number) => `group-body:${eventId}`
};

type DragTarget = {
  type: "ceremony" | "group" | "group-head" | "group-body";
  id: number;
};

export function parseCircuitDragId(value: unknown): DragTarget | null {
  const match = /^(ceremony|group|group-head|group-body):(\d+)$/.exec(String(value));
  if (!match) return null;
  return { type: match[1] as DragTarget["type"], id: Number(match[2]) };
}

export function isCircuitGroupDragId(value: unknown): boolean {
  return parseCircuitDragId(value)?.type === "group";
}

/** The sortable id of each top-level item, in order. */
export function topLevelDragIds(layout: CircuitLayout): string[] {
  return layout.map((item) =>
    item.kind === "group"
      ? circuitDragId.group(item.eventId)
      : circuitDragId.ceremony(item.ceremonyId)
  );
}

/** Where a ceremony sits: its group (null at the top level) and its index there. */
export function locateCeremony(
  layout: CircuitLayout,
  ceremonyId: number
): { groupId: number | null; index: number } | null {
  for (let i = 0; i < layout.length; i += 1) {
    const item = layout[i]!;
    if (item.kind === "single" && item.ceremonyId === ceremonyId) {
      return { groupId: null, index: i };
    }
    if (item.kind === "group") {
      const j = item.ceremonyIds.indexOf(ceremonyId);
      if (j >= 0) return { groupId: item.eventId, index: j };
    }
  }
  return null;
}

function groupIndex(layout: CircuitLayout, eventId: number): number {
  return layout.findIndex((item) => item.kind === "group" && item.eventId === eventId);
}

function groupOf(layout: CircuitLayout, eventId: number) {
  const item = layout[groupIndex(layout, eventId)];
  return item?.kind === "group" ? item : null;
}

function moveAt<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

function reorderTopLevel(
  layout: CircuitLayout,
  from: number,
  to: number
): CircuitLayoutWrite | null {
  if (from === to || to < 0 || to >= layout.length) return null;
  return {
    kind: "reorderEvents",
    eventIds: moveAt(layout, from, to).map((item) => item.eventId)
  };
}

function moveCeremony(
  layout: CircuitLayout,
  ceremonyId: number,
  groupId: number | null,
  index: number
): CircuitLayoutWrite | null {
  const from = locateCeremony(layout, ceremonyId);
  if (!from) return null;
  if (from.groupId === groupId && from.index === index) return null;
  return { kind: "moveCeremony", ceremonyId, groupId, index };
}

/**
 * The write for a drop of `activeId` on `overId`, or null when it changes
 * nothing. A group only moves among the top-level items. A ceremony dropped
 * on another ceremony takes its place, in that ceremony's group or at the top
 * level; on a group's header it goes to the top level at the group's place;
 * on a group's body it joins the group at the end.
 */
export function resolveCircuitDrop(
  layout: CircuitLayout,
  activeId: unknown,
  overId: unknown
): CircuitLayoutWrite | null {
  const active = parseCircuitDragId(activeId);
  const over = parseCircuitDragId(overId);
  if (!active || !over) return null;

  if (active.type === "group") {
    const from = groupIndex(layout, active.id);
    let to: number;
    if (over.type === "ceremony") {
      const at = locateCeremony(layout, over.id);
      if (!at) return null;
      to = at.groupId === null ? at.index : groupIndex(layout, at.groupId);
    } else {
      to = groupIndex(layout, over.id);
    }
    if (from < 0 || to < 0) return null;
    return reorderTopLevel(layout, from, to);
  }

  if (active.type !== "ceremony") return null;
  const ceremonyId = active.id;
  const from = locateCeremony(layout, ceremonyId);
  if (!from) return null;

  if (over.type === "ceremony") {
    if (over.id === ceremonyId) return null;
    const at = locateCeremony(layout, over.id);
    if (!at) return null;
    if (at.groupId === null && from.groupId === null) {
      return reorderTopLevel(layout, from.index, at.index);
    }
    return moveCeremony(layout, ceremonyId, at.groupId, at.index);
  }
  if (over.type === "group-body") {
    if (from.groupId === over.id) return null;
    const group = groupOf(layout, over.id);
    if (!group) return null;
    return moveCeremony(layout, ceremonyId, over.id, group.ceremonyIds.length);
  }
  // A group's header (or the group as a whole): the top level, at its place.
  const to = groupIndex(layout, over.id);
  if (to < 0) return null;
  if (from.groupId === null) return reorderTopLevel(layout, from.index, to);
  return moveCeremony(layout, ceremonyId, null, to);
}

/** Moves a ceremony one place up (-1) or down (+1) where it is; null at an end. */
export function stepCeremonyWrite(
  layout: CircuitLayout,
  ceremonyId: number,
  delta: -1 | 1
): CircuitLayoutWrite | null {
  const from = locateCeremony(layout, ceremonyId);
  if (!from) return null;
  if (from.groupId === null)
    return reorderTopLevel(layout, from.index, from.index + delta);
  const size = groupOf(layout, from.groupId)?.ceremonyIds.length ?? 0;
  const to = from.index + delta;
  if (to < 0 || to >= size) return null;
  return moveCeremony(layout, ceremonyId, from.groupId, to);
}

/** Moves a group one place up (-1) or down (+1) among the top-level items. */
export function stepGroupWrite(
  layout: CircuitLayout,
  eventId: number,
  delta: -1 | 1
): CircuitLayoutWrite | null {
  const from = groupIndex(layout, eventId);
  if (from < 0) return null;
  return reorderTopLevel(layout, from, from + delta);
}

/** Adds a ceremony to the end of a group; null when it is already in it. */
export function intoGroupWrite(
  layout: CircuitLayout,
  ceremonyId: number,
  eventId: number
): CircuitLayoutWrite | null {
  const group = groupOf(layout, eventId);
  const from = locateCeremony(layout, ceremonyId);
  if (!group || !from || from.groupId === eventId) return null;
  return moveCeremony(layout, ceremonyId, eventId, group.ceremonyIds.length);
}

/** Takes a ceremony out of its group, to the top level just below the group. */
export function outOfGroupWrite(
  layout: CircuitLayout,
  ceremonyId: number
): CircuitLayoutWrite | null {
  const from = locateCeremony(layout, ceremonyId);
  if (!from || from.groupId === null) return null;
  return moveCeremony(layout, ceremonyId, null, groupIndex(layout, from.groupId) + 1);
}

/**
 * The list as it will be once `write` is saved, shown while the save runs.
 * A ceremony leaving a group gets its new event from the server; until then
 * its row carries a placeholder event id.
 */
export function applyCircuitLayoutWrite(
  layout: CircuitLayout,
  write: CircuitLayoutWrite
): CircuitLayout {
  if (write.kind === "reorderEvents") {
    const byEvent = new Map(layout.map((item) => [item.eventId, item]));
    const ordered = write.eventIds.flatMap((id) => {
      const item = byEvent.get(id);
      return item ? [item] : [];
    });
    return [
      ...ordered,
      ...layout.filter((item) => !write.eventIds.includes(item.eventId))
    ];
  }
  const from = locateCeremony(layout, write.ceremonyId);
  if (!from) return layout;
  const previous = from.groupId === null ? layout[from.index] : null;
  const rest: CircuitLayout = layout.flatMap((item): CircuitLayoutItem[] => {
    if (item.kind === "single") return item.ceremonyId === write.ceremonyId ? [] : [item];
    return [
      { ...item, ceremonyIds: item.ceremonyIds.filter((id) => id !== write.ceremonyId) }
    ];
  });
  if (write.groupId !== null) {
    return rest.map((item) => {
      if (item.kind !== "group" || item.eventId !== write.groupId) return item;
      const at = Math.max(0, Math.min(write.index, item.ceremonyIds.length));
      const ids = [...item.ceremonyIds];
      ids.splice(at, 0, write.ceremonyId);
      return { ...item, ceremonyIds: ids };
    });
  }
  const single: CircuitLayoutItem = {
    kind: "single",
    eventId: previous?.eventId ?? -write.ceremonyId,
    ceremonyId: write.ceremonyId
  };
  const at = Math.max(0, Math.min(write.index, rest.length));
  return [...rest.slice(0, at), single, ...rest.slice(at)];
}
