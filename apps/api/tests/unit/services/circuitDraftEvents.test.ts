import { afterEach, describe, expect, it } from "vitest";
import {
  emitCircuitDraftEvents,
  registerCircuitDraftEventEmitter,
  type CircuitDraftEventMessage
} from "../../../src/services/circuit/circuitDraftEvents.js";

const event = (version: number) => ({
  id: version,
  draft_id: 7,
  version,
  event_type: `e${version}`,
  payload: { n: version },
  created_at: new Date("2026-11-27T20:00:00.000Z")
});

describe("circuit draft events", () => {
  afterEach(() => registerCircuitDraftEventEmitter(null));

  it("does nothing while no emitter is registered", () => {
    expect(() => emitCircuitDraftEvents(3, [event(1)])).not.toThrow();
  });

  it("sends committed events in order, addressed to the league", () => {
    const sent: CircuitDraftEventMessage[] = [];
    registerCircuitDraftEventEmitter((message) => sent.push(message));
    emitCircuitDraftEvents(3, [event(4), event(5)]);
    expect(sent.map((m) => [m.version, m.event_type])).toEqual([
      [4, "e4"],
      [5, "e5"]
    ]);
    expect(sent[0]).toMatchObject({
      draft_id: 7,
      circuit_league_id: 3,
      payload: { n: 4 },
      created_at: "2026-11-27T20:00:00.000Z"
    });
    expect(Number.isNaN(Date.parse(sent[0]!.server_time))).toBe(false);
  });
});
