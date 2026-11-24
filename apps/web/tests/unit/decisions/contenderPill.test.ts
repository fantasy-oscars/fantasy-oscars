import { describe, expect, it } from "vitest";
import {
  contenderPillName,
  contenderPillView,
  contenderTooltip
} from "@/decisions/contenderPill";
import { circuitLeagueDetail, circuitSelection } from "../circuitLeagues/fixtures";

describe("contender tooltip", () => {
  it("draws an acting contender as a performance, with the person's portrait", () => {
    const selection = {
      ...circuitSelection(2, "Paper Moon", "Ada Lane"),
      film: { id: 102, title: "Paper Moon", release_year: 2026, poster_url: "/p.jpg" },
      person: { id: 202, name: "Ada Lane", profile_url: "/a.jpg" }
    };
    expect(contenderTooltip(selection, { name: "Best Actress", kind: "ACTING" })).toEqual(
      {
        unitKind: "PERFORMANCE",
        categoryName: "Best Actress",
        filmTitle: "Paper Moon",
        filmYear: 2026,
        filmPosterUrl: "/p.jpg",
        performerName: "Ada Lane",
        performerProfileUrl: "/a.jpg"
      }
    );
  });

  it("draws any other contender as a film", () => {
    expect(
      contenderTooltip(circuitSelection(1, "Night Train"), {
        name: "Best Picture",
        kind: "FILM"
      })
    ).toEqual({
      unitKind: "FILM",
      categoryName: "Best Picture",
      filmTitle: "Night Train",
      filmYear: 2026,
      filmPosterUrl: null,
      performerName: null,
      performerProfileUrl: null
    });
  });
});

describe("contender pill name", () => {
  it("names the category and label, then points and the state's words", () => {
    expect(
      contenderPillName({ categoryName: "Best Picture", label: "Night Train (2026)" })
    ).toBe("Best Picture: Night Train (2026)");
    expect(
      contenderPillName({
        categoryName: "Best Picture",
        label: "Night Train (2026)",
        points: 1,
        stateSuffix: "dropped"
      })
    ).toBe("Best Picture: Night Train (2026), 1 point, dropped");
    expect(
      contenderPillName({
        categoryName: "Best Actress",
        label: "Ada Lane, Paper Moon (2026)",
        points: 4.5
      })
    ).toBe("Best Actress: Ada Lane, Paper Moon (2026), 4.5 points");
    expect(
      contenderPillName({
        categoryName: "Best Picture",
        label: "Static (2026)",
        stateSuffix: "owned by pia"
      })
    ).toBe("Best Picture: Static (2026), owned by pia");
  });
});

describe("contender pill view", () => {
  const { categories } = circuitLeagueDetail({ status: "DRAFTING" });

  it("takes the label, the category's name and icon, and the card from the selection", () => {
    const view = contenderPillView(
      circuitSelection(33, "Gaslight", "Ingrid Bergman"),
      categories
    );
    expect(view).toMatchObject({
      label: "Ingrid Bergman, Gaslight (2026)",
      categoryName: "Best Actress",
      iconCode: "person",
      iconVariant: "default"
    });
    expect(view.tooltip.unitKind).toBe("PERFORMANCE");
  });

  it("falls back to a neutral category and no icon when the category is unknown", () => {
    const view = contenderPillView(circuitSelection(31, "Sunset Boulevard"), []);
    expect(view).toMatchObject({ categoryName: "Contender", iconCode: null });
  });
});
