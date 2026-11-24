import { describe, expect, it } from "vitest";
import { circuitFreeAgentPreview } from "@/decisions/circuitFreeAgency";
import { circuitLeagueDetail, circuitSelection } from "../circuitLeagues/fixtures";

const categories = circuitLeagueDetail({ status: "IN_SEASON" }).categories;
const picture = { id: 20, name: "Best Picture", kind: "FILM" };
const actress = { id: 21, name: "Best Actress", kind: "ACTING" };
const film = { title: "Night Train", release_year: 2026 };

function preview(input: Partial<Parameters<typeof circuitFreeAgentPreview>[0]> = {}) {
  return circuitFreeAgentPreview({
    category: picture,
    film,
    person: null,
    categories,
    owner: undefined,
    viewerUserId: 5,
    drop: null,
    ...input
  });
}

describe("circuit free agent preview", () => {
  it("waits for a fully chosen contender", () => {
    expect(preview({ film: null })).toBeNull();
    expect(preview({ category: actress })).toBeNull();
  });

  it("draws a free agent as a default pill with the add icon enabled", () => {
    expect(preview()).toEqual({
      label: "Night Train (2026)",
      categoryName: "Best Picture",
      iconCode: "movie",
      iconVariant: "default",
      owned: false,
      caption: null,
      stateSuffix: null,
      addLabel: "Add Best Picture: Night Train (2026)",
      addTooltip: "Add",
      addDisabled: false
    });
  });

  it("names the drop in the add tooltip", () => {
    expect(
      preview({ drop: circuitSelection(2, "Paper Moon", "Ada Lane") })?.addTooltip
    ).toBe("Add, dropping Ada Lane, Paper Moon (2026)");
  });

  it("labels the icon Claim on waivers", () => {
    expect(preview({ verb: "Claim" })).toMatchObject({
      addLabel: "Claim Best Picture: Night Train (2026)",
      addTooltip: "Claim"
    });
    expect(
      preview({ verb: "Claim", owner: { user_id: 6, username: "pia" } })?.addTooltip
    ).toBe("Owned by pia");
  });

  it("labels an acting contender by person and film", () => {
    expect(preview({ category: actress, person: { name: "Ada Lane" } })?.addLabel).toBe(
      "Add Best Actress: Ada Lane, Night Train (2026)"
    );
  });

  it("mutes a contender someone holds and disables the add", () => {
    const owned = preview({ owner: { user_id: 6, username: "pia" } });
    expect(owned).toMatchObject({
      owned: true,
      caption: "Owned by pia",
      stateSuffix: "owned by pia",
      addTooltip: "Owned by pia",
      addDisabled: true
    });
    expect(preview({ owner: { user_id: 5, username: "avery" } })?.caption).toBe(
      "Already on your roster"
    );
  });
});
