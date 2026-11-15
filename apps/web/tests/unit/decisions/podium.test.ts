import { describe, expect, it } from "vitest";
import {
  hasPodiumTie,
  podiumAriaLabel,
  podiumKicker,
  podiumSignature,
  resolvePodium
} from "@/decisions/draft/podium";

describe("resolvePodium", () => {
  it("trims names, drops empties and empty places, orders by place, keeps three", () => {
    expect(
      resolvePodium([
        { place: 3, names: [" c "] },
        { place: 2, names: ["  "] },
        { place: 1, names: ["a", ""] }
      ])
    ).toEqual([
      { place: 1, names: ["a"] },
      { place: 3, names: ["c"] }
    ]);
    expect(resolvePodium([])).toEqual([]);
  });
});

describe("podium labels", () => {
  it("kickers name the place, with tied variants", () => {
    expect(podiumKicker(1, false)).toBe("Winner");
    expect(podiumKicker(1, true)).toBe("Joint winner");
    expect(podiumKicker(2, false)).toBe("2nd");
    expect(podiumKicker(2, true)).toBe("Tied 2nd");
    expect(podiumKicker(3, false)).toBe("3rd");
    expect(podiumKicker(3, true)).toBe("Tied 3rd");
  });

  it("aria labels list every tied name", () => {
    expect(podiumAriaLabel({ place: 1, names: ["a", "b"] })).toBe(
      "First place: a, b (tied)"
    );
    expect(podiumAriaLabel({ place: 1, names: ["a"] })).toBe("First place: a");
    expect(podiumAriaLabel({ place: 2, names: ["a"] })).toBe("Second place: a");
    expect(podiumAriaLabel({ place: 3, names: ["a", "b"] })).toBe(
      "Third place: a, b (tied)"
    );
  });

  it("signature changes with the podium; ties are detected", () => {
    const one = [{ place: 1 as const, names: ["a"] }];
    const tied = [{ place: 1 as const, names: ["a", "b"] }];
    expect(podiumSignature(one)).not.toBe(podiumSignature(tied));
    expect(hasPodiumTie(one)).toBe(false);
    expect(hasPodiumTie(tied)).toBe(true);
  });
});
