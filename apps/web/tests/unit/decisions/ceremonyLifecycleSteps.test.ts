import { describe, expect, it } from "vitest";
import {
  STEP_ORDER,
  computeStepState,
  inferStepFromPathname
} from "@/decisions/admin/ceremonyWizard";
import { isCeremonyWorkflowStepAllowed } from "@/decisions/admin/ceremonyWorkflowNav";
import {
  canArchiveCeremony,
  canWithdrawCeremony,
  type CeremonyStatus
} from "@/decisions/ceremonyLifecycle";
import {
  ceremonyStatusLabel,
  getCeremonyWorkflowSteps,
  getNextCeremonyWorkflowStep
} from "@/decisions/ceremonyWorkflow";
import { computeSeasonDraftRoomCtaLabel } from "@/decisions/season";

const FINALIZED_AT = "2027-03-15T05:00:00.000Z";

const identity = { code: "osc-2027", name: "Oscars 2027" };
const empty = {
  categories_total: 0,
  categories_with_nominees: 0,
  nominees_total: 0,
  winners_total: 0
};
const partial = {
  categories_total: 3,
  categories_with_nominees: 2,
  nominees_total: 8,
  winners_total: 0
};
const full = {
  categories_total: 3,
  categories_with_nominees: 3,
  nominees_total: 12,
  winners_total: 0
};

describe("ceremony wizard steps", () => {
  it("places Open for leagues between Publish and Results", () => {
    const ids = STEP_ORDER.map((s) => s.id);
    expect(ids.indexOf("open")).toBe(ids.indexOf("publish") + 1);
    expect(ids.indexOf("results")).toBe(ids.indexOf("open") + 1);
    expect(inferStepFromPathname("/admin/ceremonies/4/open")).toBe("open");
  });

  it("lets a draft ceremony publish with only its identity", () => {
    expect(
      computeStepState({
        step: "publish",
        ceremony: { ...identity, status: "DRAFT" },
        stats: empty
      }).state
    ).toBe("INCOMPLETE_EDITABLE");
  });

  it("gates Open for leagues until the ceremony is published", () => {
    expect(
      computeStepState({
        step: "open",
        ceremony: { ...identity, status: "DRAFT" },
        stats: full
      }).state
    ).toBe("GATED");
  });

  it("asks for every category's nominees before opening a published ceremony", () => {
    expect(
      computeStepState({
        step: "open",
        ceremony: { ...identity, status: "PUBLISHED" },
        stats: partial
      })
    ).toEqual({
      state: "INCOMPLETE_EDITABLE",
      reason: "Requires nominees for every category."
    });
  });

  it.each<CeremonyStatus>(["ACTIVE", "LOCKED", "ARCHIVED"])(
    "marks Open for leagues done once %s",
    (status) => {
      expect(
        computeStepState({ step: "open", ceremony: { ...identity, status }, stats: full })
          .state
      ).toBe("COMPLETE_LOCKED");
    }
  );

  it.each<[CeremonyStatus, string]>([
    ["DRAFT", "COMPLETE_EDITABLE"],
    ["PUBLISHED", "COMPLETE_EDITABLE"],
    ["ACTIVE", "COMPLETE_LOCKED"],
    ["LOCKED", "COMPLETE_LOCKED"],
    ["ARCHIVED", "COMPLETE_LOCKED"]
  ])("categories in %s are %s", (status, expected) => {
    expect(
      computeStepState({
        step: "categories",
        ceremony: { ...identity, status },
        stats: full
      }).state
    ).toBe(expected);
  });

  it("locks results once they are finalized, not before", () => {
    const stats = { ...full, winners_total: 3 };
    expect(
      computeStepState({
        step: "results",
        ceremony: { ...identity, status: "LOCKED", results_finalized_at: null },
        stats
      }).state
    ).toBe("COMPLETE_EDITABLE");
    expect(
      computeStepState({
        step: "results",
        ceremony: { ...identity, status: "LOCKED", results_finalized_at: FINALIZED_AT },
        stats
      }).state
    ).toBe("COMPLETE_LOCKED");
  });
});

describe("ceremony workflow", () => {
  it("allows the structure step only while content is editable", () => {
    const allowed = (ceremonyStatus: CeremonyStatus) =>
      isCeremonyWorkflowStepAllowed({ stepId: "structure", ceremonyStatus });
    expect(allowed("DRAFT")).toBe(true);
    expect(allowed("PUBLISHED")).toBe(true);
    expect(allowed("ACTIVE")).toBe(false);
  });

  it("allows the open step only for a published ceremony", () => {
    const allowed = (ceremonyStatus: CeremonyStatus) =>
      isCeremonyWorkflowStepAllowed({ stepId: "open", ceremonyStatus });
    expect(allowed("PUBLISHED")).toBe(true);
    expect(allowed("DRAFT")).toBe(false);
    expect(allowed("ACTIVE")).toBe(false);
  });

  it("suggests opening for leagues once a published ceremony is populated", () => {
    expect(
      getNextCeremonyWorkflowStep({
        ceremony: { ...identity, status: "PUBLISHED" },
        stats: full
      })?.id
    ).toBe("open");
    expect(
      getNextCeremonyWorkflowStep({
        ceremony: { ...identity, status: "PUBLISHED" },
        stats: partial
      })?.id
    ).toBe("populate");
  });

  it("reports the open step done from ACTIVE on", () => {
    const openRow = (status: CeremonyStatus) =>
      getCeremonyWorkflowSteps({ ceremony: { ...identity, status }, stats: full }).find(
        (s) => s.id === "open"
      )?.status;
    expect(openRow("PUBLISHED")).toBe("NOT_STARTED");
    expect(openRow("ACTIVE")).toBe("DONE");
  });

  it("labels each status, telling final results apart from results in progress", () => {
    expect(ceremonyStatusLabel("PUBLISHED")).toBe("Published");
    expect(ceremonyStatusLabel("ACTIVE")).toBe("Open for leagues");
    expect(ceremonyStatusLabel("LOCKED", null)).toBe("Results in progress");
    expect(ceremonyStatusLabel("LOCKED", FINALIZED_AT)).toBe("Results final");
  });
});

describe("canArchiveCeremony", () => {
  it("needs a locked ceremony with finalized results", () => {
    expect(
      canArchiveCeremony({ status: "LOCKED", resultsFinalizedAt: FINALIZED_AT })
    ).toBe(true);
    expect(canArchiveCeremony({ status: "LOCKED", resultsFinalizedAt: null })).toBe(
      false
    );
    expect(canArchiveCeremony({ status: "ACTIVE", resultsFinalizedAt: null })).toBe(
      false
    );
    expect(
      canArchiveCeremony({ status: "ARCHIVED", resultsFinalizedAt: FINALIZED_AT })
    ).toBe(false);
  });
});

describe("canWithdrawCeremony", () => {
  it.each<[CeremonyStatus, boolean]>([
    ["DRAFT", false],
    ["PUBLISHED", true],
    ["ACTIVE", false],
    ["LOCKED", false],
    ["ARCHIVED", false]
  ])("%s: %s", (status, withdrawable) => {
    expect(canWithdrawCeremony(status)).toBe(withdrawable);
  });
});

describe("computeSeasonDraftRoomCtaLabel", () => {
  it("shows results once they are finalized", () => {
    expect(
      computeSeasonDraftRoomCtaLabel({
        ceremonyStatus: "LOCKED",
        resultsFinalizedAt: FINALIZED_AT,
        draftStatus: "COMPLETED"
      })
    ).toBe("View results");
  });

  it("does not show final results while winners are still being entered", () => {
    expect(
      computeSeasonDraftRoomCtaLabel({
        ceremonyStatus: "LOCKED",
        resultsFinalizedAt: null,
        draftStatus: "COMPLETED"
      })
    ).toBe("View draft results");
  });
});
