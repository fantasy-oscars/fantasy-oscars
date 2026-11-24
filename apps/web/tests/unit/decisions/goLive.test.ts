import { describe, expect, it } from "vitest";
import {
  comingSoonNote,
  comingSoonSetupNote,
  draftStartGate,
  goLiveOptionLabel,
  isComingSoon
} from "@/decisions/goLive";

const CEREMONY_STATUSES = ["DRAFT", "PUBLISHED", "ACTIVE", "LOCKED", "ARCHIVED"];
const CIRCUIT_STATUSES = ["DRAFT", "PUBLISHED", "ACTIVE", "ARCHIVED"];

describe("coming soon", () => {
  it("is the published state only", () => {
    expect(CEREMONY_STATUSES.filter(isComingSoon)).toEqual(["PUBLISHED"]);
    expect(isComingSoon("published")).toBe(true);
    expect(isComingSoon(null)).toBe(false);
    expect(isComingSoon(undefined)).toBe(false);
  });

  it("labels a picker option only while it is not live", () => {
    expect(goLiveOptionLabel({ name: "Oscars 2037", status: "PUBLISHED" })).toBe(
      "Oscars 2037 · Coming soon"
    );
    expect(goLiveOptionLabel({ name: "Oscars 2036", status: "ACTIVE" })).toBe(
      "Oscars 2036"
    );
  });

  it("notes the start date on a season card when it is known", () => {
    expect(
      comingSoonNote({ status: "PUBLISHED", startsAt: "2037-03-07T12:00:00Z" })
    ).toBe("Coming soon · Mar 7, 2037");
    expect(comingSoonNote({ status: "PUBLISHED", startsAt: null })).toBe("Coming soon");
    expect(comingSoonNote({ status: "PUBLISHED", startsAt: "not a date" })).toBe(
      "Coming soon"
    );
    expect(comingSoonNote({ status: "PUBLISHED" })).toBe("Coming soon");
    for (const status of ["DRAFT", "ACTIVE", "LOCKED", "ARCHIVED", null]) {
      expect(comingSoonNote({ status, startsAt: "2037-03-07T12:00:00Z" })).toBeNull();
    }
  });

  it("tells a commissioner what works now and what waits, per kind of season", () => {
    expect(comingSoonSetupNote("ceremony")).toMatch(/when the ceremony goes live\.$/);
    expect(comingSoonSetupNote("season")).toMatch(/when the season goes live\.$/);
    expect(comingSoonSetupNote("season")).not.toMatch(/circuit/i);
  });
});

describe("can the draft start", () => {
  it("lets a commissioner start a ceremony draft only once the ceremony is live", () => {
    const rows = CEREMONY_STATUSES.map((status) => [
      status,
      draftStartGate({ room: "ceremony", status, canManage: true })
    ]);
    expect(Object.fromEntries(rows)).toEqual({
      DRAFT: {
        canStart: false,
        showStart: true,
        blockedLine: "Opens when the ceremony goes live"
      },
      PUBLISHED: {
        canStart: false,
        showStart: true,
        blockedLine: "Opens when the ceremony goes live"
      },
      ACTIVE: { canStart: true, showStart: true, blockedLine: null },
      // Locked and archived ceremonies are past go-live; the server owns those refusals.
      LOCKED: { canStart: true, showStart: true, blockedLine: null },
      ARCHIVED: { canStart: true, showStart: true, blockedLine: null }
    });
  });

  it("lets a commissioner start a season draft only once the season is live", () => {
    const rows = CIRCUIT_STATUSES.map((status) => [
      status,
      draftStartGate({ room: "season", status, canManage: true })
    ]);
    expect(Object.fromEntries(rows)).toEqual({
      DRAFT: {
        canStart: false,
        showStart: true,
        blockedLine: "Opens when the season goes live"
      },
      PUBLISHED: {
        canStart: false,
        showStart: true,
        blockedLine: "Opens when the season goes live"
      },
      ACTIVE: { canStart: true, showStart: true, blockedLine: null },
      ARCHIVED: { canStart: true, showStart: true, blockedLine: null }
    });
  });

  it("never lets a player start, and shows them the same line", () => {
    for (const room of ["ceremony", "season"] as const) {
      for (const status of CEREMONY_STATUSES) {
        const gate = draftStartGate({ room, status, canManage: false });
        expect(gate.canStart).toBe(false);
        expect(gate.showStart).toBe(false);
        expect(gate.blockedLine).toBe(
          draftStartGate({ room, status, canManage: true }).blockedLine
        );
      }
    }
  });

  it("does not block on a status it does not know", () => {
    for (const status of [null, undefined, ""]) {
      expect(draftStartGate({ room: "ceremony", status, canManage: true })).toEqual({
        canStart: true,
        showStart: true,
        blockedLine: null
      });
    }
    expect(
      draftStartGate({ room: "season", status: "published", canManage: true }).canStart
    ).toBe(false);
  });
});
