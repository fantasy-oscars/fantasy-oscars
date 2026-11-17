import { describe, expect, it } from "vitest";
import {
  applyCircuitLayoutWrite,
  circuitDragId as id,
  circuitLayout,
  intoGroupWrite,
  outOfGroupWrite,
  resolveCircuitDrop,
  stepCeremonyWrite,
  stepGroupWrite,
  topLevelDragIds,
  type CircuitLayout
} from "@/decisions/admin/circuitLayout";

// Top level: BAFTA (single, event 11), Guild Awards (group 20: SAG 2, PGA 3),
// Globes (single, event 12), Critics (empty group 21).
const layout: CircuitLayout = [
  { kind: "single", eventId: 11, ceremonyId: 1 },
  { kind: "group", eventId: 20, ceremonyIds: [2, 3] },
  { kind: "single", eventId: 12, ceremonyId: 4 },
  { kind: "group", eventId: 21, ceremonyIds: [] }
];

describe("Circuit ceremonies layout", () => {
  it("builds the top level from events, with singles as plain rows and groups in order", () => {
    const built = circuitLayout(
      [
        { id: 11, is_group: false },
        { id: 20, is_group: true },
        { id: 12, is_group: false },
        { id: 21, is_group: true },
        { id: 13, is_group: false } // an empty single event is not shown
      ],
      [
        { ceremony_id: 3, circuit_event_id: 20, sort_index: 1 },
        { ceremony_id: 1, circuit_event_id: 11, sort_index: 0 },
        { ceremony_id: 2, circuit_event_id: 20, sort_index: 0 },
        { ceremony_id: 4, circuit_event_id: 12, sort_index: 0 }
      ]
    );
    expect(built).toEqual(layout);
    expect(topLevelDragIds(built)).toEqual([
      "ceremony:1",
      "group:20",
      "ceremony:4",
      "group:21"
    ]);
  });

  it("drags a single ceremony into a group, onto a row or the group's body", () => {
    expect(resolveCircuitDrop(layout, id.ceremony(1), id.ceremony(3))).toEqual({
      kind: "moveCeremony",
      ceremonyId: 1,
      groupId: 20,
      index: 1
    });
    expect(resolveCircuitDrop(layout, id.ceremony(4), id.groupBody(21))).toEqual({
      kind: "moveCeremony",
      ceremonyId: 4,
      groupId: 21,
      index: 0
    });
  });

  it("drags a grouped ceremony out to the top level, onto a single or a group's header", () => {
    expect(resolveCircuitDrop(layout, id.ceremony(2), id.ceremony(4))).toEqual({
      kind: "moveCeremony",
      ceremonyId: 2,
      groupId: null,
      index: 2
    });
    expect(resolveCircuitDrop(layout, id.ceremony(3), id.groupHead(20))).toEqual({
      kind: "moveCeremony",
      ceremonyId: 3,
      groupId: null,
      index: 1
    });
  });

  it("reorders inside a group, and among top-level items as events", () => {
    expect(resolveCircuitDrop(layout, id.ceremony(3), id.ceremony(2))).toEqual({
      kind: "moveCeremony",
      ceremonyId: 3,
      groupId: 20,
      index: 0
    });
    expect(resolveCircuitDrop(layout, id.ceremony(1), id.ceremony(4))).toEqual({
      kind: "reorderEvents",
      eventIds: [20, 12, 11, 21]
    });
    expect(resolveCircuitDrop(layout, id.group(21), id.ceremony(1))).toEqual({
      kind: "reorderEvents",
      eventIds: [21, 11, 20, 12]
    });
    // A group dropped on a row inside another group takes that group's place.
    expect(resolveCircuitDrop(layout, id.group(21), id.ceremony(2))).toEqual({
      kind: "reorderEvents",
      eventIds: [11, 21, 20, 12]
    });
  });

  it("ignores drops that change nothing", () => {
    expect(resolveCircuitDrop(layout, id.ceremony(2), id.ceremony(2))).toBeNull();
    expect(resolveCircuitDrop(layout, id.ceremony(2), id.groupBody(20))).toBeNull();
    expect(resolveCircuitDrop(layout, id.group(20), id.groupHead(20))).toBeNull();
    expect(resolveCircuitDrop(layout, id.ceremony(2), null)).toBeNull();
  });

  it("offers the same moves from the menu: up, down, into a group and out of one", () => {
    expect(stepCeremonyWrite(layout, 1, -1)).toBeNull();
    expect(stepCeremonyWrite(layout, 1, 1)).toEqual({
      kind: "reorderEvents",
      eventIds: [20, 11, 12, 21]
    });
    expect(stepCeremonyWrite(layout, 2, 1)).toEqual({
      kind: "moveCeremony",
      ceremonyId: 2,
      groupId: 20,
      index: 1
    });
    expect(stepCeremonyWrite(layout, 3, 1)).toBeNull();
    expect(stepGroupWrite(layout, 21, 1)).toBeNull();
    expect(stepGroupWrite(layout, 20, -1)).toEqual({
      kind: "reorderEvents",
      eventIds: [20, 11, 12, 21]
    });
    expect(intoGroupWrite(layout, 4, 20)).toEqual({
      kind: "moveCeremony",
      ceremonyId: 4,
      groupId: 20,
      index: 2
    });
    expect(intoGroupWrite(layout, 2, 20)).toBeNull();
    expect(outOfGroupWrite(layout, 2)).toEqual({
      kind: "moveCeremony",
      ceremonyId: 2,
      groupId: null,
      index: 2
    });
    expect(outOfGroupWrite(layout, 1)).toBeNull();
  });

  it("shows the list as it will be while a move saves", () => {
    expect(
      applyCircuitLayoutWrite(layout, {
        kind: "moveCeremony",
        ceremonyId: 1,
        groupId: 21,
        index: 0
      })
    ).toEqual([
      { kind: "group", eventId: 20, ceremonyIds: [2, 3] },
      { kind: "single", eventId: 12, ceremonyId: 4 },
      { kind: "group", eventId: 21, ceremonyIds: [1] }
    ]);
    // Leaving a group: a placeholder event until the server makes the real one.
    expect(
      applyCircuitLayoutWrite(layout, {
        kind: "moveCeremony",
        ceremonyId: 3,
        groupId: null,
        index: 0
      })
    ).toEqual([
      { kind: "single", eventId: -3, ceremonyId: 3 },
      { kind: "single", eventId: 11, ceremonyId: 1 },
      { kind: "group", eventId: 20, ceremonyIds: [2] },
      { kind: "single", eventId: 12, ceremonyId: 4 },
      { kind: "group", eventId: 21, ceremonyIds: [] }
    ]);
    expect(
      applyCircuitLayoutWrite(layout, {
        kind: "reorderEvents",
        eventIds: [21, 12, 20, 11]
      })
    ).toEqual([layout[3], layout[2], layout[1], layout[0]]);
  });
});
