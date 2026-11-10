import { describe, expect, it } from "vitest";
import {
  BRAND_CATALOG,
  BRAND_IDS,
  DARK_MODE,
  LIGHT_MODE,
  type BrandCatalogEntry,
  type BrandId
} from "@fantasy-oscars/shared/brands";
import { DEFAULT_APPEARANCE_SETTINGS } from "@fantasy-oscars/shared/appearance";
import {
  APPEARANCE_COPY,
  UNDISCOVERED_VALUE,
  applyAppearancePatch,
  applyRandomListChange,
  deriveAppearanceView,
  mergeAppearancePatches,
  pageForValues,
  planAppearanceChange,
  saveStatusText,
  type AppearanceOption,
  type AppearanceOptionGroup,
  type AppearanceState
} from "@/decisions/appearance";

const id = (slug: string) => slug as BrandId;
const cinemaA = id("cinema-a");
const cinemaB = id("cinema-b");
const FIXTURE: readonly BrandCatalogEntry[] = [
  ...BRAND_CATALOG,
  { id: cinemaA, collection: "cinema", modes: [LIGHT_MODE, DARK_MODE] },
  { id: cinemaB, collection: "cinema", modes: [{ id: "sepia", base: "dark" }] }
];
const FIXTURE_ENABLED: readonly BrandId[] = [...BRAND_IDS, cinemaA, cinemaB];
const FIXTURE_LABELS = { "cinema-a": "Cinema A", "cinema-b": "Cinema B" };

const ALL = BRAND_IDS;
const ONE: readonly BrandId[] = ["refined-gold"];

function state(
  patch: {
    discovered?: BrandId[];
    settings?: Partial<AppearanceState["settings"]>;
    fixedUnavailable?: boolean;
  } = {}
): AppearanceState {
  return {
    discovered: patch.discovered ?? [],
    draw: null,
    fixedUnavailable: patch.fixedUnavailable ?? false,
    settings: { ...DEFAULT_APPEARANCE_SETTINGS, ...patch.settings }
  };
}

function groups(data: (AppearanceOption | AppearanceOptionGroup)[] | undefined) {
  return (data ?? []).filter((d): d is AppearanceOptionGroup => "group" in d);
}

function optionValues(data: (AppearanceOption | AppearanceOptionGroup)[] | undefined) {
  return (data ?? []).flatMap((d) => ("group" in d ? d.items : [d])).map((o) => o.value);
}

describe("deriveAppearanceView: Random list", () => {
  it("one theme released: the only option is selected, disabled and explained", () => {
    const view = deriveAppearanceView(state(), { enabled: ONE });
    expect(view.random?.value).toEqual(["refined-gold"]);
    expect(view.random?.atFloor).toBe(true);
    expect(view.random?.helper).toBe(APPEARANCE_COPY.floorHelper);
    expect(optionValues(view.random?.data)).toEqual(["refined-gold"]);
    expect(groups(view.random?.data)[0]?.items[0]?.disabled).toBe(true);
  });

  it("nothing discovered but Refined Gold: Undiscovered themes first, both selected, no floor", () => {
    const view = deriveAppearanceView(state(), { enabled: ALL });
    expect(view.random?.data[0]).toEqual({
      value: UNDISCOVERED_VALUE,
      label: "Undiscovered themes"
    });
    expect(view.random?.value).toEqual([UNDISCOVERED_VALUE, "refined-gold"]);
    expect(view.random?.atFloor).toBe(false);
    expect(view.random?.helper).toBe(APPEARANCE_COPY.discoveryHelper);
    expect(groups(view.random?.data).map((g) => g.group)).toEqual(["Ceremony"]);
  });

  it("lists only discovered themes, in catalog order, and selects those not excluded", () => {
    const view = deriveAppearanceView(
      state({ discovered: ["noir", "ballot"], settings: { excluded: ["noir"] } }),
      { enabled: ALL }
    );
    expect(optionValues(view.random?.data)).toEqual([
      UNDISCOVERED_VALUE,
      "refined-gold",
      "ballot",
      "noir"
    ]);
    expect(view.random?.value).toEqual([UNDISCOVERED_VALUE, "refined-gold", "ballot"]);
  });

  it("Undiscovered themes off is unselected but still offered", () => {
    const view = deriveAppearanceView(
      state({ settings: { undiscoveredEnabled: false } }),
      { enabled: ALL }
    );
    expect(optionValues(view.random?.data)).toContain(UNDISCOVERED_VALUE);
    expect(view.random?.value).toEqual(["refined-gold"]);
    expect(view.random?.atFloor).toBe(true);
  });

  it("all discovered: no Undiscovered option and no discovery helper", () => {
    const view = deriveAppearanceView(state({ discovered: [...ALL] }), { enabled: ALL });
    expect(optionValues(view.random?.data)).not.toContain(UNDISCOVERED_VALUE);
    expect(view.random?.helper).toBeNull();
    expect(view.random?.value).toEqual([...ALL]);
    expect(view.random?.atFloor).toBe(false);
  });

  it("shows the Cinema heading only when a Cinema theme is discovered", () => {
    const context = {
      enabled: FIXTURE_ENABLED,
      catalog: FIXTURE,
      labels: FIXTURE_LABELS
    };
    const before = deriveAppearanceView(state(), context);
    expect(groups(before.random?.data).map((g) => g.group)).toEqual(["Ceremony"]);
    const after = deriveAppearanceView(state({ discovered: [cinemaA] }), context);
    expect(groups(after.random?.data).map((g) => g.group)).toEqual([
      "Ceremony",
      "Cinema"
    ]);
    expect(groups(after.random?.data)[1]?.items).toEqual([
      { value: "cinema-a", label: "Cinema A" }
    ]);
  });

  it("an emptied selection falls back to everything discovered, selected", () => {
    const view = deriveAppearanceView(
      state({
        discovered: ["ballot"],
        settings: { excluded: ["refined-gold", "ballot"], undiscoveredEnabled: false }
      }),
      { enabled: ALL }
    );
    expect(view.random?.value).toEqual(["refined-gold", "ballot"]);
    expect(view.random?.atFloor).toBe(false);
  });

  it("the last selected theme is the disabled one when Undiscovered is off", () => {
    const view = deriveAppearanceView(
      state({
        discovered: ["ballot"],
        settings: { excluded: ["refined-gold"], undiscoveredEnabled: false }
      }),
      { enabled: ALL }
    );
    expect(view.random?.value).toEqual(["ballot"]);
    const items = groups(view.random?.data).flatMap((g) => g.items);
    expect(items.filter((o) => o.disabled).map((o) => o.value)).toEqual(["ballot"]);
  });
});

describe("deriveAppearanceView: Fixed and Random", () => {
  it("Random: Theme control reads Random, with the Random helper and no Select", () => {
    const view = deriveAppearanceView(state(), { enabled: ALL });
    expect(view.selection.value).toBe("random");
    expect(view.selection.helper).toBe(APPEARANCE_COPY.randomHelper);
    expect(view.fixed).toBeNull();
    expect(view.random).not.toBeNull();
  });

  it("Fixed: a grouped Select of discovered themes and the Fixed helper", () => {
    const view = deriveAppearanceView(
      state({ discovered: ["noir"], settings: { fixed: "noir" } }),
      { enabled: ALL }
    );
    expect(view.selection.value).toBe("fixed");
    expect(view.selection.helper).toBe(APPEARANCE_COPY.fixedHelper);
    expect(view.random).toBeNull();
    expect(view.fixed?.value).toBe("noir");
    expect(view.fixed?.data).toEqual([
      {
        group: "Ceremony",
        items: [
          { value: "refined-gold", label: "Refined Gold" },
          { value: "noir", label: "Noir" }
        ]
      }
    ]);
  });

  it("Fixed on one theme released: one option", () => {
    const view = deriveAppearanceView(state({ settings: { fixed: "refined-gold" } }), {
      enabled: ONE
    });
    expect(view.fixed?.data.flatMap((g) => g.items)).toHaveLength(1);
  });

  it("a stored Fixed theme that is not released shows Random and says why", () => {
    const view = deriveAppearanceView(state({ fixedUnavailable: true }), {
      enabled: ONE
    });
    expect(view.selection.value).toBe("random");
    expect(view.selection.note).toBe(APPEARANCE_COPY.fixedUnavailable);
  });

  it("a stored Fixed theme the person has not met still appears in the list", () => {
    const view = deriveAppearanceView(state({ settings: { fixed: "lightbox" } }), {
      enabled: ALL
    });
    expect(view.fixed?.data.flatMap((g) => g.items.map((o) => o.value))).toEqual([
      "refined-gold",
      "lightbox"
    ]);
  });

  it("Fixed on a single-mode theme explains that Mode does not change it", () => {
    const context = {
      enabled: FIXTURE_ENABLED,
      catalog: FIXTURE,
      labels: FIXTURE_LABELS
    };
    const single = deriveAppearanceView(
      state({ discovered: [cinemaB], settings: { fixed: cinemaB } }),
      context
    );
    expect(single.mode.note).toBe(
      "Cinema B has one mode, so this setting doesn't change it."
    );
    const double = deriveAppearanceView(
      state({ discovered: [cinemaA], settings: { fixed: cinemaA } }),
      context
    );
    expect(double.mode.note).toBeNull();
  });

  it("Mode offers Light, Dark and Theme default", () => {
    const view = deriveAppearanceView(state({ settings: { mode: "dark" } }), {
      enabled: ALL
    });
    expect(view.mode.value).toBe("dark");
    expect(view.mode.options.map((o) => o.label)).toEqual([
      "Light",
      "Dark",
      "Theme default"
    ]);
    expect(view.mode.helper).toBe(APPEARANCE_COPY.modeHelper);
  });
});

describe("deriveAppearanceView: single-mode control", () => {
  const context = { enabled: FIXTURE_ENABLED, catalog: FIXTURE, labels: FIXTURE_LABELS };

  it("is never shown with the shipped catalog", () => {
    for (const mode of ["light", "dark", "theme"] as const) {
      const view = deriveAppearanceView(
        state({ discovered: [...ALL], settings: { mode } }),
        { enabled: ALL }
      );
      expect(view.conflict).toBeNull();
    }
  });

  it("is shown for Light or Dark, Random and a discovered single-mode theme", () => {
    const view = deriveAppearanceView(
      state({ discovered: [cinemaB], settings: { mode: "light" } }),
      context
    );
    expect(view.conflict?.options.map((o) => o.label)).toEqual([
      "Use the theme's own mode",
      "Leave those themes out"
    ]);
    expect(view.conflict?.helper).toBe(APPEARANCE_COPY.conflictHelper);
    expect(view.conflict?.value).toBe("own");
  });

  it("is hidden for Theme default, Fixed, or when the single-mode theme is undiscovered", () => {
    expect(
      deriveAppearanceView(
        state({ discovered: [cinemaB], settings: { mode: "theme" } }),
        context
      ).conflict
    ).toBeNull();
    expect(
      deriveAppearanceView(
        state({ discovered: [cinemaB], settings: { mode: "dark", fixed: cinemaB } }),
        context
      ).conflict
    ).toBeNull();
    expect(
      deriveAppearanceView(state({ settings: { mode: "dark" } }), context).conflict
    ).toBeNull();
  });
});

describe("applyRandomListChange", () => {
  it("removing a theme excludes it", () => {
    const patch = applyRandomListChange(
      state({ discovered: ["ballot", "noir"] }),
      [UNDISCOVERED_VALUE, "refined-gold", "ballot"],
      { enabled: ALL }
    );
    expect(patch).toEqual({ random_excluded_brands: ["noir"] });
  });

  it("adding a theme back drops its exclusion", () => {
    const patch = applyRandomListChange(
      state({ discovered: ["ballot", "noir"], settings: { excluded: ["noir"] } }),
      [UNDISCOVERED_VALUE, "refined-gold", "ballot", "noir"],
      { enabled: ALL }
    );
    expect(patch).toEqual({ random_excluded_brands: [] });
  });

  it("toggling Undiscovered themes writes only that field", () => {
    const patch = applyRandomListChange(state(), ["refined-gold"], { enabled: ALL });
    expect(patch).toEqual({ undiscovered_enabled: false });
  });

  it("rejects a change that leaves nothing selected", () => {
    expect(
      applyRandomListChange(state({ settings: { undiscoveredEnabled: false } }), [], {
        enabled: ALL
      })
    ).toBeNull();
    expect(applyRandomListChange(state(), [], { enabled: ONE })).toBeNull();
  });

  it("accepts removing the last theme while Undiscovered themes keeps an option", () => {
    const patch = applyRandomListChange(state(), [UNDISCOVERED_VALUE], { enabled: ALL });
    expect(patch).toEqual({ random_excluded_brands: ["refined-gold"] });
  });

  it("keeps exclusions for themes not yet discovered", () => {
    const patch = applyRandomListChange(
      state({ discovered: ["ballot"], settings: { excluded: ["noir"] } }),
      [UNDISCOVERED_VALUE, "refined-gold"],
      { enabled: ALL }
    );
    expect(patch).toEqual({ random_excluded_brands: ["ballot", "noir"] });
  });

  it("returns an empty patch when nothing changed", () => {
    expect(
      applyRandomListChange(state(), [UNDISCOVERED_VALUE, "refined-gold"], {
        enabled: ALL
      })
    ).toEqual({});
  });
});

describe("planAppearanceChange", () => {
  const context = {
    enabled: ALL,
    currentBrand: "ballot" as BrandId,
    identity: "user:42",
    day: 20766
  };
  const discovered: BrandId[] = ["ballot", "noir"];

  it("Mode repaints the theme on screen in the resolved mode", () => {
    const plan = planAppearanceChange(
      { kind: "mode", mode: "dark" },
      state({ discovered }),
      context
    );
    expect(plan?.patch).toEqual({ mode_preference: "dark" });
    expect(plan?.page).toEqual({ brand: "ballot", mode: DARK_MODE });
    expect(plan?.clearShuffle).toBe(false);
  });

  it("Mode to Theme default uses the theme's primary mode", () => {
    const plan = planAppearanceChange(
      { kind: "mode", mode: "theme" },
      state({ discovered, settings: { mode: "dark" } }),
      { ...context, currentBrand: "noir" }
    );
    expect(plan?.page).toEqual({ brand: "noir", mode: DARK_MODE });
    const light = planAppearanceChange(
      { kind: "mode", mode: "theme" },
      state({ discovered, settings: { mode: "dark" } }),
      context
    );
    expect(light?.page).toEqual({ brand: "ballot", mode: LIGHT_MODE });
  });

  it("an unchanged value writes nothing", () => {
    expect(
      planAppearanceChange({ kind: "mode", mode: "theme" }, state(), context)
    ).toBeNull();
    expect(
      planAppearanceChange({ kind: "policy", policy: "own" }, state(), context)
    ).toBeNull();
  });

  it("Random to Fixed pins the theme on screen and ends a shuffle", () => {
    const plan = planAppearanceChange(
      { kind: "selection", selection: "fixed" },
      state({ discovered }),
      context
    );
    expect(plan?.patch).toEqual({ brand_preference: "ballot" });
    expect(plan?.page?.brand).toBe("ballot");
    expect(plan?.clearShuffle).toBe(true);
  });

  it("changing the Fixed theme repaints it at once", () => {
    const plan = planAppearanceChange(
      { kind: "fixed", brand: "noir" },
      state({ discovered, settings: { fixed: "ballot" } }),
      context
    );
    expect(plan?.patch).toEqual({ brand_preference: "noir" });
    expect(plan?.page).toEqual({ brand: "noir", mode: DARK_MODE });
    expect(plan?.clearShuffle).toBe(true);
  });

  it("Fixed to Random uses today's record when there is one", () => {
    const record = {
      day: 20766,
      brand: id("noir"),
      rounds: { ceremony: [id("noir")], cinema: [] }
    };
    const plan = planAppearanceChange(
      { kind: "selection", selection: "random" },
      { ...state({ discovered, settings: { fixed: "ballot" } }), draw: record },
      context
    );
    expect(plan?.patch).toEqual({ brand_preference: "random" });
    expect(plan?.page?.brand).toBe("noir");
  });

  it("Fixed to Random draws now without a record, and saves the draw and its discovery", () => {
    const plan = planAppearanceChange(
      { kind: "selection", selection: "random" },
      state({ settings: { fixed: "ballot" } }),
      context
    );
    expect(plan?.patch.brand_preference).toBe("random");
    expect(plan?.patch.daily_draw?.day).toBe(20766);
    expect(plan?.page?.brand).toBe(plan?.patch.daily_draw?.brand);
    const drawn = plan?.patch.daily_draw?.brand;
    if (drawn && drawn !== "refined-gold") {
      expect(plan?.patch.add_discovered_brands).toEqual([drawn]);
    }
  });

  it("Random-list and conflict changes do not touch the page", () => {
    const list = planAppearanceChange(
      { kind: "random-list", value: [UNDISCOVERED_VALUE, "refined-gold", "ballot"] },
      state({ discovered }),
      context
    );
    expect(list?.patch).toEqual({ random_excluded_brands: ["noir"] });
    expect(list?.page).toBeNull();
    const policy = planAppearanceChange(
      { kind: "policy", policy: "exclude" },
      state(),
      context
    );
    expect(policy?.patch).toEqual({ single_mode_policy: "exclude" });
    expect(policy?.page).toBeNull();
  });

  it("a rejected Random-list change plans nothing", () => {
    expect(
      planAppearanceChange({ kind: "random-list", value: [] }, state(), {
        ...context,
        enabled: ONE
      })
    ).toBeNull();
  });
});

describe("patches", () => {
  it("merges later fields over earlier ones and adds up discoveries", () => {
    expect(
      mergeAppearancePatches(
        { mode_preference: "light", add_discovered_brands: ["noir"] },
        { mode_preference: "dark", add_discovered_brands: ["noir", "ballot"] }
      )
    ).toEqual({ mode_preference: "dark", add_discovered_brands: ["noir", "ballot"] });
  });

  it("applies a patch to the saved values for the optimistic view", () => {
    const next = applyAppearancePatch(
      state({ discovered: ["ballot"] }),
      {
        brand_preference: "noir",
        mode_preference: "light",
        random_excluded_brands: ["ballot"],
        undiscovered_enabled: false,
        single_mode_policy: "exclude",
        add_discovered_brands: ["noir"]
      },
      ALL
    );
    expect(next.settings).toEqual({
      fixed: "noir",
      mode: "light",
      excluded: ["ballot"],
      undiscoveredEnabled: false,
      singleModePolicy: "exclude"
    });
    expect(next.discovered).toEqual(["ballot", "noir"]);
    expect(
      applyAppearancePatch(
        state({ settings: { fixed: "noir" } }),
        { brand_preference: "random" },
        ALL
      ).settings.fixed
    ).toBeNull();
  });

  it("words the save status", () => {
    expect(saveStatusText("saving")).toBe("Saving…");
    expect(saveStatusText("saved")).toBe("Saved");
    expect(saveStatusText("idle")).toBe("");
  });
});

describe("pageForValues", () => {
  const context = { enabled: ALL, currentBrand: "ballot" as BrandId, day: 20766 };
  const record = {
    day: 20766,
    brand: id("noir"),
    rounds: { ceremony: [id("noir")], cinema: [] }
  };

  it("keeps the theme on screen when there is nothing to draw from", () => {
    expect(pageForValues(state({ settings: { mode: "dark" } }), context)).toEqual({
      brand: "ballot",
      mode: DARK_MODE
    });
  });

  it("prefers the Fixed theme, then today's record", () => {
    expect(pageForValues(state({ settings: { fixed: "noir" } }), context)?.brand).toBe(
      "noir"
    );
    expect(pageForValues({ ...state(), draw: record }, context)?.brand).toBe("noir");
  });

  it("ignores a record from an earlier day", () => {
    expect(
      pageForValues({ ...state(), draw: { ...record, day: 20765 } }, context)?.brand
    ).toBe("ballot");
  });
});
