import { getSnakeSeatForPick } from "@fantasy-oscars/shared";
import { describe, expect, it } from "vitest";
import {
  assertCircuitDraftPausable,
  assertCircuitDraftResumable,
  assertCircuitDraftStartable,
  assertCircuitDraftTakingPicks,
  assertOnTheClock,
  chooseCircuitAutoPick,
  circuitDraftPickTimer,
  circuitDraftSlot,
  circuitDraftTurn,
  isCircuitDraftPickDue,
  nextCircuitDraftPick,
  regularPickCount,
  resumedCircuitDraftDeadline,
  resumedCircuitDraftStatus,
  shuffleUniformly
} from "../../../src/domain/circuitDraft.js";

/**
 * A random source that makes Fisher–Yates choose index `choices[k]` at its
 * k-th draw: floor(r * (i + 1)) = j for r = (j + 0.5) / (i + 1).
 */
function scripted(n: number, choices: readonly number[]) {
  let k = 0;
  return () => {
    const i = n - 1 - k;
    const j = choices[k]!;
    k += 1;
    return (j + 0.5) / (i + 1);
  };
}

/** Every sequence of draws Fisher–Yates can make over n items. */
function allChoiceSequences(n: number): number[][] {
  let sequences: number[][] = [[]];
  for (let i = n - 1; i > 0; i -= 1) {
    sequences = sequences.flatMap((seq) =>
      Array.from({ length: i + 1 }, (_, j) => [...seq, j])
    );
  }
  return sequences;
}

describe("shuffleUniformly", () => {
  it("maps each sequence of draws to a different order, so every order is equally likely", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const items = Array.from({ length: n }, (_, i) => i + 1);
      const sequences = allChoiceSequences(n);
      const orders = new Set(
        sequences.map((choices) =>
          shuffleUniformly(items, scripted(n, choices)).join(",")
        )
      );
      const factorial = items.reduce((acc, v) => acc * v, 1);
      // n! equally likely draw sequences onto n! distinct orders: a bijection.
      expect(sequences).toHaveLength(factorial);
      expect(orders.size).toBe(factorial);
    }
  });

  it("keeps every item exactly once and leaves the input alone", () => {
    const items = [10, 20, 30, 40];
    const shuffled = shuffleUniformly(items, () => 0);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
    expect(items).toEqual([10, 20, 30, 40]);
  });

  it("swaps each position with one drawn from the unshuffled prefix", () => {
    // Draws 0, 0, 0 rotate [1, 2, 3, 4] to [2, 3, 4, 1].
    expect(shuffleUniformly([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1]);
    // Draws at the top of the range leave the order unchanged.
    expect(shuffleUniformly([1, 2, 3, 4], () => 0.999)).toEqual([1, 2, 3, 4]);
  });

  it("spreads the first seat evenly over many shuffles", () => {
    let seed = 42;
    const random = () => {
      // Park–Miller, deterministic so the test never flakes.
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    const counts = [0, 0, 0, 0];
    const trials = 40_000;
    for (let t = 0; t < trials; t += 1) {
      counts[shuffleUniformly([0, 1, 2, 3], random)[0]!] += 1;
    }
    for (const count of counts) {
      expect(Math.abs(count / trials - 0.25)).toBeLessThan(0.01);
    }
  });
});

describe("circuitDraftTurn", () => {
  it("follows getSnakeSeatForPick through every regular pick", () => {
    for (const seatCount of [1, 2, 3, 5]) {
      const rounds = 4;
      for (let pick = 1; pick <= regularPickCount(seatCount, rounds); pick += 1) {
        expect(circuitDraftTurn({ seatCount, rounds, pickNumber: pick })).toEqual({
          pick_number: pick,
          round_number: Math.ceil(pick / seatCount),
          seat_number: getSnakeSeatForPick(seatCount, pick)
        });
      }
    }
  });

  it("snakes: the last seat picks twice at the turn", () => {
    const seats = [1, 2, 3, 4, 5, 6].map(
      (pickNumber) =>
        circuitDraftTurn({ seatCount: 3, rounds: 2, pickNumber })!.seat_number
    );
    expect(seats).toEqual([1, 2, 3, 3, 2, 1]);
  });

  it("has no regular turn after the last round", () => {
    expect(circuitDraftTurn({ seatCount: 3, rounds: 2, pickNumber: 7 })).toBeNull();
  });

  it("has no turn without a pick on the clock or without seats", () => {
    expect(circuitDraftTurn({ seatCount: 3, rounds: 2, pickNumber: null })).toBeNull();
    expect(circuitDraftTurn({ seatCount: 3, rounds: 2, pickNumber: 0 })).toBeNull();
    expect(circuitDraftTurn({ seatCount: 0, rounds: 2, pickNumber: 1 })).toBeNull();
  });
});

describe("circuitDraftPickTimer", () => {
  it("keeps the league's clock, and reads a missing one as untimed", () => {
    expect(circuitDraftPickTimer(90)).toBe(90);
    expect(circuitDraftPickTimer(0)).toBe(0);
    expect(circuitDraftPickTimer(null)).toBe(0);
  });
});

describe("draft guards", () => {
  it("starts only an initialised snake league with members", () => {
    expect(() =>
      assertCircuitDraftStartable({ status: "INITIALIZED", draft_type: "SNAKE" }, 2)
    ).not.toThrow();
    expect(() =>
      assertCircuitDraftStartable({ status: "SETUP", draft_type: "SNAKE" }, 2)
    ).toThrow(expect.objectContaining({ code: "CIRCUIT_DRAFT_NOT_STARTABLE" }));
    expect(() =>
      assertCircuitDraftStartable({ status: "DRAFTING", draft_type: "SNAKE" }, 2)
    ).toThrow(expect.objectContaining({ code: "CIRCUIT_DRAFT_NOT_STARTABLE" }));
    expect(() =>
      assertCircuitDraftStartable({ status: "INITIALIZED", draft_type: "AUCTION" }, 2)
    ).toThrow(expect.objectContaining({ code: "CIRCUIT_DRAFT_TYPE_UNSUPPORTED" }));
    expect(() =>
      assertCircuitDraftStartable({ status: "INITIALIZED", draft_type: "SNAKE" }, 0)
    ).toThrow(expect.objectContaining({ code: "CIRCUIT_LEAGUE_EMPTY" }));
  });

  it("takes picks only while the draft runs", () => {
    expect(() => assertCircuitDraftTakingPicks({ status: "IN_PROGRESS" })).not.toThrow();
    expect(() => assertCircuitDraftTakingPicks({ status: "PAUSED" })).toThrow(
      expect.objectContaining({ code: "CIRCUIT_DRAFT_PAUSED" })
    );
    expect(() => assertCircuitDraftTakingPicks({ status: "COMPLETED" })).toThrow(
      expect.objectContaining({ code: "CIRCUIT_DRAFT_NOT_IN_PROGRESS" })
    );
  });

  it("takes a pick only from the member on the clock", () => {
    expect(() => assertOnTheClock(7, 7)).not.toThrow();
    expect(() => assertOnTheClock(7, 8)).toThrow(
      expect.objectContaining({ code: "CIRCUIT_DRAFT_NOT_YOUR_TURN", status: 409 })
    );
  });
});

describe("circuitDraftSlot", () => {
  const missed = [
    { original_pick_number: 2, seat_number: 2 },
    { original_pick_number: 5, seat_number: 2 }
  ];

  it("is the regular turn during the regular rounds", () => {
    expect(circuitDraftSlot({ seatCount: 3, rounds: 2, pickNumber: 4, missed })).toEqual({
      pick_number: 4,
      original_pick_number: 4,
      seat_number: getSnakeSeatForPick(3, 4),
      supplemental: false
    });
  });

  it("then owes each missed pick once, in original pick order, to the seat that missed it", () => {
    const slots = [7, 8].map((n) =>
      circuitDraftSlot({ seatCount: 3, rounds: 2, pickNumber: n, missed })
    );
    expect(slots).toEqual([
      { pick_number: 7, original_pick_number: 2, seat_number: 2, supplemental: true },
      { pick_number: 8, original_pick_number: 5, seat_number: 2, supplemental: true }
    ]);
  });

  it("has nothing on the clock past the supplemental round or without a pick", () => {
    expect(
      circuitDraftSlot({ seatCount: 3, rounds: 2, pickNumber: 9, missed })
    ).toBeNull();
    expect(
      circuitDraftSlot({ seatCount: 3, rounds: 2, pickNumber: 7, missed: [] })
    ).toBeNull();
    expect(
      circuitDraftSlot({ seatCount: 3, rounds: 2, pickNumber: null, missed })
    ).toBeNull();
  });
});

describe("nextCircuitDraftPick", () => {
  it("moves through the regular rounds, then completes when nothing was missed", () => {
    const base = { seatCount: 3, rounds: 2, missedCount: 0 };
    expect(nextCircuitDraftPick({ ...base, pickNumber: 5 })).toEqual({
      pick_number: 6,
      status: "IN_PROGRESS"
    });
    expect(nextCircuitDraftPick({ ...base, pickNumber: 6 })).toBeNull();
  });

  it("runs one supplemental pick per missed regular pick, then completes", () => {
    const base = { seatCount: 3, rounds: 2, missedCount: 2 };
    expect(nextCircuitDraftPick({ ...base, pickNumber: 6 })).toEqual({
      pick_number: 7,
      status: "SUPPLEMENTAL"
    });
    expect(nextCircuitDraftPick({ ...base, pickNumber: 7 })).toEqual({
      pick_number: 8,
      status: "SUPPLEMENTAL"
    });
    expect(nextCircuitDraftPick({ ...base, pickNumber: 8 })).toBeNull();
  });
});

describe("isCircuitDraftPickDue", () => {
  const now = new Date("2026-11-25T20:00:00Z");
  const past = new Date(now.getTime() - 1);

  it("is due once the deadline of a timed, running draft has passed", () => {
    for (const status of ["IN_PROGRESS", "SUPPLEMENTAL"]) {
      expect(
        isCircuitDraftPickDue(
          { status, pick_timer_seconds: 90, pick_deadline_at: past },
          now
        )
      ).toBe(true);
    }
    expect(
      isCircuitDraftPickDue(
        {
          status: "IN_PROGRESS",
          pick_timer_seconds: 90,
          pick_deadline_at: new Date(now.getTime() + 1)
        },
        now
      )
    ).toBe(false);
  });

  it("is never due untimed (0), paused or finished", () => {
    expect(
      isCircuitDraftPickDue(
        { status: "IN_PROGRESS", pick_timer_seconds: 0, pick_deadline_at: past },
        now
      )
    ).toBe(false);
    for (const status of ["PAUSED", "COMPLETED", "PENDING"]) {
      expect(
        isCircuitDraftPickDue(
          { status, pick_timer_seconds: 90, pick_deadline_at: past },
          now
        )
      ).toBe(false);
    }
  });
});

describe("chooseCircuitAutoPick", () => {
  const PICTURE = 1;
  const ACTOR = 2;
  const queue = [
    { selection_id: 10, category_id: ACTOR },
    { selection_id: 11, category_id: PICTURE },
    { selection_id: 12, category_id: PICTURE }
  ];
  const base = {
    queue,
    unavailable: new Set<number>(),
    held: [],
    rosterSize: 3,
    maxOwnedByCategory: new Map<number, number | null>([
      [PICTURE, null],
      [ACTOR, 1]
    ])
  };

  it("takes the first queued selection", () => {
    expect(chooseCircuitAutoPick(base)).toBe(10);
  });

  it("skips selections that are owned or drafted", () => {
    expect(chooseCircuitAutoPick({ ...base, unavailable: new Set([10, 11]) })).toBe(12);
  });

  it("skips selections that do not fit the category limits", () => {
    expect(
      chooseCircuitAutoPick({ ...base, held: [{ selection_id: 20, category_id: ACTOR }] })
    ).toBe(11);
  });

  it("misses (null) with an empty queue, a fully owned queue or a full roster", () => {
    expect(chooseCircuitAutoPick({ ...base, queue: [] })).toBeNull();
    expect(
      chooseCircuitAutoPick({ ...base, unavailable: new Set([10, 11, 12]) })
    ).toBeNull();
    expect(
      chooseCircuitAutoPick({
        ...base,
        rosterSize: 1,
        held: [{ selection_id: 20, category_id: PICTURE }]
      })
    ).toBeNull();
  });

  it("never picks outside the queue, even when other selections are free", () => {
    const picked = chooseCircuitAutoPick({
      ...base,
      queue: [{ selection_id: 11, category_id: PICTURE }],
      unavailable: new Set([11])
    });
    expect(picked).toBeNull();
  });
});

describe("pause and resume", () => {
  it("pauses only a running draft and resumes only a paused one", () => {
    expect(() => assertCircuitDraftPausable({ status: "IN_PROGRESS" })).not.toThrow();
    expect(() => assertCircuitDraftPausable({ status: "SUPPLEMENTAL" })).not.toThrow();
    expect(() => assertCircuitDraftPausable({ status: "PAUSED" })).toThrow(
      expect.objectContaining({ code: "CIRCUIT_DRAFT_PAUSED" })
    );
    expect(() => assertCircuitDraftPausable({ status: "COMPLETED" })).toThrow(
      expect.objectContaining({ code: "CIRCUIT_DRAFT_NOT_IN_PROGRESS" })
    );
    expect(() => assertCircuitDraftResumable({ status: "PAUSED" })).not.toThrow();
    expect(() => assertCircuitDraftResumable({ status: "IN_PROGRESS" })).toThrow(
      expect.objectContaining({ code: "CIRCUIT_DRAFT_NOT_PAUSED" })
    );
  });

  it("resumes in the supplemental round once the regular rounds are over", () => {
    expect(resumedCircuitDraftStatus({ seatCount: 3, rounds: 2, pickNumber: 6 })).toBe(
      "IN_PROGRESS"
    );
    expect(resumedCircuitDraftStatus({ seatCount: 3, rounds: 2, pickNumber: 7 })).toBe(
      "SUPPLEMENTAL"
    );
  });

  it("resumes with the time that was left, a full clock when none was, untimed at 0", () => {
    const pausedAt = new Date("2026-11-25T20:00:00Z");
    const now = new Date("2026-11-25T21:00:00Z");
    const resumed = (pickDeadlineAt: Date | null, pickTimerSeconds = 90) =>
      resumedCircuitDraftDeadline({ pickTimerSeconds, pickDeadlineAt, pausedAt, now });
    expect(resumed(new Date(pausedAt.getTime() + 30_000))).toEqual(
      new Date(now.getTime() + 30_000)
    );
    expect(resumed(new Date(pausedAt.getTime() - 1))).toEqual(
      new Date(now.getTime() + 90_000)
    );
    expect(resumed(null)).toEqual(new Date(now.getTime() + 90_000));
    expect(resumed(new Date(pausedAt.getTime() + 30_000), 0)).toBeNull();
  });
});
