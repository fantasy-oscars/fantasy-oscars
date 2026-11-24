import { describe, expect, it } from "vitest";
import {
  coverageRows,
  readinessIconFlags,
  readinessTodos,
  type ReadinessInput
} from "@/decisions/admin/circuitReadiness";

const globes = { ceremony_id: 1, ceremony_name: "Golden Globes", ceremony_code: "gg" };
const wga = { ceremony_id: 2, ceremony_name: null, ceremony_code: "wga" };

const report: ReadinessInput = {
  ready: false,
  gaps: {
    missing_dates: [{ ...wga, missing: ["nominations_on", "results_on"] }],
    ceremonies_without_mappings: [wga],
    categories_without_ceremony: [{ id: 9, name: "Animated" }],
    categories_without_icon: [{ id: 9, name: "Animated" }],
    shared_icons: [
      { icon_code: "movie", categories: [{ name: "Picture" }, { name: "Director" }] }
    ]
  },
  coverage: {
    ceremonies: [
      {
        ...globes,
        supplies: [
          { circuit_category_id: 5, name: "Picture", edition_ids: [1, 2] },
          { circuit_category_id: 6, name: "Director", edition_ids: [3] }
        ],
        unmapped_editions: [{ id: 4, name: "Score" }],
        edition_count: 4
      },
      { ...wga, supplies: [], unmapped_editions: [], edition_count: 0 }
    ]
  }
};

describe("Circuit readiness decisions", () => {
  it("lists dates, unsupplied ceremonies and unsupplied categories as to-dos", () => {
    expect(readinessTodos(report).map((t) => t.text)).toEqual([
      "Needs a date: wga: nominations date, ceremony date",
      "Supplies no category: wga",
      "No ceremony supplies Animated"
    ]);
  });

  it("has nothing to do for a ready Circuit", () => {
    expect(
      readinessTodos({
        ready: true,
        gaps: {
          missing_dates: [],
          ceremonies_without_mappings: [],
          categories_without_ceremony: []
        },
        coverage: { ceremonies: [] }
      })
    ).toEqual([]);
  });

  it("describes what each ceremony supplies and leaves unmapped", () => {
    expect(coverageRows(report)).toEqual([
      {
        ceremonyId: 1,
        label: "Golden Globes",
        supplies: [
          { id: 5, name: "Picture", editions: 2 },
          { id: 6, name: "Director", editions: 1 }
        ],
        unmapped: [{ id: 4, name: "Score" }]
      },
      { ceremonyId: 2, label: "wga", supplies: [], unmapped: [] }
    ]);
  });
});

describe("readinessIconFlags", () => {
  it("names categories without an icon and those sharing one, apart from the to-do list", () => {
    expect(readinessIconFlags(report)).toEqual([
      {
        key: "no-icon-9",
        text: "Animated has no icon, so its pills show the neutral trophy"
      },
      { key: "shared-icon-movie", text: "Picture, Director share the icon movie" }
    ]);
    expect(readinessTodos(report).map((t) => t.text)).not.toContain(
      "Animated has no icon, so its pills show the neutral trophy"
    );
  });
});
