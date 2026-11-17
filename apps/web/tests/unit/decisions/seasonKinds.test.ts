import { describe, expect, it } from "vitest";
import {
  canCreateSeasons,
  ceremonyKindAvailability,
  fullKindAvailability,
  parseSeasonKind,
  selectedSeasonKind,
  SEASON_KIND_COPY,
  type SeasonKindAvailability
} from "@/decisions/seasonKinds";
import type { CircuitSummary } from "@/lib/types";

function circuit(id: number, status = "ACTIVE", name = `Awards ${id}`): CircuitSummary {
  return { id, code: `c${id}`, name, status, opens_on: null, activated_at: null };
}

const open: SeasonKindAvailability = { available: true };
const closed: SeasonKindAvailability = { available: false, reason: "x", retry: false };

describe("season kind copy", () => {
  it("uses the approved names and never says Circuit", () => {
    expect(SEASON_KIND_COPY.ceremony.name).toBe("Single ceremony");
    expect(SEASON_KIND_COPY.full.name).toBe("Full awards season");
    expect(JSON.stringify(SEASON_KIND_COPY)).not.toMatch(/circuit/i);
  });
});

describe("single ceremony availability", () => {
  it("is available while at least one ceremony is open", () => {
    expect(ceremonyKindAvailability(1)).toEqual({ available: true });
  });

  it("explains itself when no ceremony is open", () => {
    expect(ceremonyKindAvailability(0)).toEqual({
      available: false,
      reason: "No ceremonies are open for leagues right now.",
      retry: false
    });
  });
});

describe("full awards season availability", () => {
  it("is available when an active Circuit is not yet running in this league", () => {
    expect(
      fullKindAvailability({
        circuits: [circuit(1), circuit(2)],
        started: [{ circuit_id: 1 }]
      })
    ).toEqual({ available: true });
  });

  it("says none is open when no Circuit is active", () => {
    expect(
      fullKindAvailability({ circuits: [circuit(1, "ARCHIVED")], started: [] })
    ).toEqual({
      available: false,
      reason: "No full awards season is open right now.",
      retry: false
    });
    expect(fullKindAvailability({ circuits: [], started: [] })).toMatchObject({
      reason: "No full awards season is open right now."
    });
  });

  it("names the one open awards season the league already plays", () => {
    expect(
      fullKindAvailability({
        circuits: [circuit(1, "ACTIVE", "Awards Season 2035"), circuit(2, "ARCHIVED")],
        started: [{ circuit_id: 1 }]
      })
    ).toEqual({
      available: false,
      reason: "This league already plays Awards Season 2035.",
      retry: false
    });
  });

  it("says the league plays every open awards season when it plays several", () => {
    expect(
      fullKindAvailability({
        circuits: [circuit(1), circuit(2)],
        started: [{ circuit_id: 1 }, { circuit_id: 2 }]
      })
    ).toEqual({
      available: false,
      reason: "This league already plays every open awards season.",
      retry: false
    });
  });

  it("offers a retry when either list failed to load", () => {
    const failed = {
      available: false,
      reason: "Couldn't check for open awards seasons.",
      retry: true
    };
    expect(fullKindAvailability({ circuits: null, started: [] })).toEqual(failed);
    expect(fullKindAvailability({ circuits: [circuit(1)], started: null })).toEqual(
      failed
    );
  });
});

describe("selected kind", () => {
  it("preselects nothing when both kinds are available", () => {
    expect(
      selectedSeasonKind({
        requested: null,
        availability: { ceremony: open, full: open }
      })
    ).toBeNull();
  });

  it("keeps the requested kind when it is available", () => {
    expect(
      selectedSeasonKind({
        requested: "full",
        availability: { ceremony: open, full: open }
      })
    ).toBe("full");
  });

  it("preselects the only available kind and ignores a request for the other", () => {
    expect(
      selectedSeasonKind({
        requested: null,
        availability: { ceremony: open, full: closed }
      })
    ).toBe("ceremony");
    expect(
      selectedSeasonKind({
        requested: "ceremony",
        availability: { ceremony: closed, full: open }
      })
    ).toBe("full");
  });

  it("selects nothing when neither kind is available", () => {
    expect(
      selectedSeasonKind({
        requested: "full",
        availability: { ceremony: closed, full: closed }
      })
    ).toBeNull();
  });

  it("parses only known kinds from the URL", () => {
    expect(parseSeasonKind("ceremony")).toBe("ceremony");
    expect(parseSeasonKind("full")).toBe("full");
    expect(parseSeasonKind("circuit")).toBeNull();
    expect(parseSeasonKind(null)).toBeNull();
  });
});

describe("who may create seasons", () => {
  it("allows owners and co-owners only", () => {
    const members = [
      { user_id: 1, role: "OWNER" },
      { user_id: 2, role: "CO_OWNER" },
      { user_id: 3, role: "MEMBER" }
    ];
    expect(canCreateSeasons(members, 1)).toBe(true);
    expect(canCreateSeasons(members, 2)).toBe(true);
    expect(canCreateSeasons(members, 3)).toBe(false);
    expect(canCreateSeasons(members, 4)).toBe(false);
    expect(canCreateSeasons(null, 1)).toBe(false);
    expect(canCreateSeasons(members, Number.NaN)).toBe(false);
  });
});
