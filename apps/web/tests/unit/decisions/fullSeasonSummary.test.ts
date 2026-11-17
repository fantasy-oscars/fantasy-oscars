import { describe, expect, it } from "vitest";
import {
  fullSeasonDefaults,
  type FullSeasonSettings,
  type SettingsCategory,
  type SettingsEvent
} from "@/decisions/fullSeasonSettings";
import {
  areaStatusLine,
  cappedList,
  categoryLimitValue,
  categoryWeightValue,
  draftSummary,
  durationLabel,
  eventsOnMeta,
  eventsSummary,
  limitedMeta,
  rosterSummary,
  scoringSummary,
  weightedMeta
} from "@/decisions/fullSeasonSummary";

const SIX = [
  "Guild Awards",
  "Golden Globes",
  "Critics' Choice",
  "BAFTA",
  "Independent Spirit",
  "Oscars"
];

function events(names: string[]): SettingsEvent[] {
  return names.map((name, i) => ({ id: i + 1, name, is_group: false, ceremonies: [] }));
}

function categories(names: string[]): SettingsCategory[] {
  return names.map((name, i) => ({ id: 100 + i, name }));
}

function settingsFor(
  evs: SettingsEvent[],
  cats: SettingsCategory[],
  patch: (s: FullSeasonSettings) => void = () => {}
): FullSeasonSettings {
  const s = fullSeasonDefaults(evs, cats);
  patch(s);
  return s;
}

describe("events summary", () => {
  const six = events(SIX);

  it("default: all count equally, every name listed", () => {
    expect(eventsSummary(settingsFor(six, []), six)).toEqual({
      line1: "All 6 events count equally.",
      line2:
        "Guild Awards, Golden Globes, Critics' Choice, BAFTA, Independent Spirit, Oscars",
      empty: false
    });
  });

  it("some off: counts and lists only the events that are on", () => {
    const s = settingsFor(six, [], (x) => {
      x.events[2]!.enabled = false;
      x.events[3]!.enabled = false;
    });
    expect(eventsSummary(s, six)).toMatchObject({
      line1: "4 of 6 events count equally.",
      line2: "Guild Awards, BAFTA, Independent Spirit, Oscars"
    });
  });

  it("weighted: says how many and prints weights as typed", () => {
    const s = settingsFor(six, [], (x) => {
      x.events[4]!.weight = 1.5;
      x.events[6]!.weight = 3;
    });
    expect(eventsSummary(s, six)).toMatchObject({
      line1: "All 6 events count; 2 weighted differently.",
      line2:
        "Guild Awards, Golden Globes, Critics' Choice, BAFTA ×1.5, Independent Spirit, Oscars ×3"
    });
  });

  it("many: the first six that are on, then how many more", () => {
    const fifteen = events(Array.from({ length: 15 }, (_, i) => `Event ${i + 1}`));
    const s = settingsFor(fifteen, [], (x) => {
      for (const e of Object.values(x.events)) e.weight = 2;
    });
    expect(eventsSummary(s, fifteen)).toMatchObject({
      line1: "All 15 events count; 15 weighted differently.",
      line2:
        "Event 1 ×2, Event 2 ×2, Event 3 ×2, Event 4 ×2, Event 5 ×2, Event 6 ×2 and 9 more"
    });
  });

  it("one event", () => {
    const one = events(["Oscars"]);
    expect(eventsSummary(settingsFor(one, []), one)).toMatchObject({
      line1: "1 event counts.",
      line2: "Oscars"
    });
    const weighted = settingsFor(one, [], (x) => {
      x.events[1]!.weight = 2;
    });
    expect(eventsSummary(weighted, one).line2).toBe("Oscars ×2");
  });

  it("none on: nothing will score", () => {
    const s = settingsFor(six, [], (x) => {
      for (const e of Object.values(x.events)) e.enabled = false;
    });
    expect(eventsSummary(s, six)).toEqual({
      line1: "No events count, so nothing will score.",
      line2: null,
      empty: false
    });
  });

  it("no events yet: empty, so the button is disabled", () => {
    expect(eventsSummary(settingsFor([], []), [])).toEqual({
      line1: "This awards season has no events yet.",
      line2: null,
      empty: true
    });
  });
});

describe("scoring summary", () => {
  const cats = categories([
    "Best Picture",
    "Best Director",
    "Best Actor",
    "Best Actress"
  ]);

  it("default", () => {
    expect(scoringSummary(settingsFor([], cats), cats)).toEqual({
      line1: "1 point per nomination, 2 per win.",
      line2: "Every category counts equally.",
      empty: false
    });
  });

  it("points: zero nominations, zero wins, both zero, and plural points", () => {
    const line1 = (nom: number, win: number) =>
      scoringSummary(
        settingsFor([], cats, (x) => {
          x.nominationPoints = nom;
          x.winBonusPoints = win;
        }),
        cats
      ).line1;
    expect(line1(0, 2)).toBe("No points for nominations, 2 per win.");
    expect(line1(1, 0)).toBe("1 point per nomination, none for wins.");
    expect(line1(0, 0)).toBe("No points for nominations or wins.");
    expect(line1(3, 5)).toBe("3 points per nomination, 5 per win.");
  });

  it("one to three weighted categories are named", () => {
    const s = settingsFor([], cats, (x) => {
      x.categories[100]!.weight = 2;
      x.categories[101]!.weight = 1.5;
    });
    expect(scoringSummary(s, cats).line2).toBe(
      "Weighted: Best Picture ×2, Best Director ×1.5."
    );
  });

  it("more than three: the first three, then how many more", () => {
    const many = categories([
      "Best Picture",
      "Best Director",
      "Best Actor",
      ...Array.from({ length: 21 }, (_, i) => `Category ${i}`)
    ]);
    const s = settingsFor([], many, (x) => {
      for (const c of Object.values(x.categories)) c.weight = 2;
      x.categories[102]!.weight = 1.5;
    });
    expect(scoringSummary(s, many).line2).toBe(
      "Weighted: Best Picture ×2, Best Director ×2, Best Actor ×1.5 and 21 more."
    );
  });

  it("no categories yet", () => {
    expect(scoringSummary(settingsFor([], []), []).line2).toBe(
      "This awards season has no categories yet."
    );
  });
});

describe("roster summary", () => {
  const cats = categories([
    "Best Picture",
    "Best Actor",
    "Best Actress",
    "Best Director",
    "Best Score",
    "Best Song",
    "Best Editing"
  ]);

  it("default and a single spot", () => {
    expect(rosterSummary(settingsFor([], cats), cats)).toEqual({
      line1: "16 contenders per player.",
      line2: "No category limits.",
      empty: false
    });
    expect(
      rosterSummary(
        settingsFor([], cats, (x) => {
          x.rosterSize = 1;
        }),
        cats
      ).line1
    ).toBe("1 contender per player.");
  });

  it("one to three limits are named", () => {
    const s = settingsFor([], cats, (x) => {
      x.categories[100]!.maxOwned = 2;
      x.categories[101]!.maxOwned = 3;
    });
    expect(rosterSummary(s, cats).line2).toBe("Limits: Best Picture 2, Best Actor 3.");
  });

  it("more than three: the first three, then how many more", () => {
    const s = settingsFor([], cats, (x) => {
      x.categories[100]!.maxOwned = 2;
      for (const id of [101, 102, 103, 104, 105, 106]) x.categories[id]!.maxOwned = 3;
    });
    expect(rosterSummary(s, cats).line2).toBe(
      "Limits: Best Picture 2, Best Actor 3, Best Actress 3 and 4 more."
    );
  });

  it("says when the limits cannot fill a roster", () => {
    const two = categories(["Best Picture", "Best Actor"]);
    const s = settingsFor([], two, (x) => {
      x.categories[100]!.maxOwned = 6;
      x.categories[101]!.maxOwned = 6;
    });
    expect(rosterSummary(s, two).line2).toBe(
      "Limits: Best Picture 6, Best Actor 6. Limits allow only 12."
    );
  });

  it("no categories yet", () => {
    expect(rosterSummary(settingsFor([], []), []).line2).toBe(
      "This awards season has no categories yet."
    );
  });
});

describe("draft summary", () => {
  it("default, timer off and auto-draft off", () => {
    expect(draftSummary(settingsFor([], []))).toEqual({
      line1: "Snake draft, 90 seconds per pick.",
      line2: "Auto-draft on.",
      empty: false
    });
    const off = settingsFor([], [], (x) => {
      x.pickTimerSeconds = null;
      x.autoDraftEnabled = false;
    });
    expect(draftSummary(off)).toMatchObject({
      line1: "Snake draft, no pick timer.",
      line2: "Auto-draft off."
    });
  });

  it("uses the largest unit that divides the duration exactly", () => {
    expect(durationLabel(1)).toBe("1 second");
    expect(durationLabel(45)).toBe("45 seconds");
    expect(durationLabel(120)).toBe("2 minutes");
    expect(durationLabel(3600)).toBe("1 hour");
    expect(durationLabel(86400)).toBe("1 day");
    expect(durationLabel(5400)).toBe("90 minutes");
  });
});

describe("summary helpers", () => {
  it("caps lists with no Oxford comma", () => {
    expect(cappedList(["A"], 3)).toBe("A");
    expect(cappedList(["A", "B", "C"], 3)).toBe("A, B, C");
    expect(cappedList(["A", "B", "C", "D"], 3)).toBe("A, B, C and 1 more");
  });

  it("labels modal metas, status lines and read-only values", () => {
    expect(eventsOnMeta(4, 6)).toBe("4 of 6 on");
    expect(weightedMeta(0)).toBe("Every category counts equally");
    expect(weightedMeta(2)).toBe("2 weighted");
    expect(limitedMeta(0)).toBe("No limits");
    expect(limitedMeta(3)).toBe("3 limited");
    expect(areaStatusLine("events", false)).toBe("Events updated.");
    expect(areaStatusLine("scoring", true)).toBe("Scoring saved.");
    expect(categoryWeightValue(2)).toBe("Weight 2");
    expect(categoryLimitValue(null)).toBe("No limit");
    expect(categoryLimitValue(2)).toBe("Limit 2");
  });
});
