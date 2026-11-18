import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { instantOfDay } from "../../../src/domain/circuit.js";
import {
  nextWaiverResolutionCheckAt,
  startCircuitWaiverScheduler
} from "../../../src/services/circuit/circuitWaiverScheduler.js";

describe("nextWaiverResolutionCheckAt", () => {
  it("is just after the next midnight in Los Angeles", () => {
    const evening = new Date("2026-12-07T07:30:00Z"); // Dec 6, 23:30 PST
    expect(nextWaiverResolutionCheckAt(evening)).toEqual(
      new Date(instantOfDay("2026-12-07").getTime() + 5_000)
    );
  });

  it("moves to the following midnight once one has passed", () => {
    const justAfter = new Date(instantOfDay("2026-12-07").getTime() + 1);
    expect(nextWaiverResolutionCheckAt(justAfter)).toEqual(
      new Date(instantOfDay("2026-12-08").getTime() + 5_000)
    );
  });
});

describe("startCircuitWaiverScheduler", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("touches no database when disabled", async () => {
    vi.stubEnv("CIRCUIT_WAIVER_SCHEDULER_ENABLED", "false");
    const connect = vi.fn();
    const scheduler = startCircuitWaiverScheduler({ connect } as unknown as Pool);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await scheduler.stop();
    expect(connect).not.toHaveBeenCalled();
  });
});
