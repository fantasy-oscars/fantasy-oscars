import { describe, expect, it } from "vitest";
import {
  circuitLeagueCategoriesBody,
  circuitLeagueCreateBody,
  circuitLeagueEventsBody,
  circuitLeagueSettingsBody
} from "../../src/schemas/index.js";

const message = (result: { error?: { issues: Array<{ message: string }> } }) =>
  result.error?.issues[0]?.message;

describe("circuit league schemas", () => {
  it("create takes a circuit id", () => {
    expect(circuitLeagueCreateBody.parse({ circuit_id: "3" })).toEqual({ circuit_id: 3 });
    expect(message(circuitLeagueCreateBody.safeParse({}))).toBe("Choose a season");
  });

  it("settings accept a partial edit and need at least one field", () => {
    expect(circuitLeagueSettingsBody.parse({ roster_size: "12" })).toEqual({
      roster_size: 12
    });
    expect(
      circuitLeagueSettingsBody.parse({
        pick_timer_seconds: null,
        auto_draft_enabled: false
      })
    ).toEqual({ pick_timer_seconds: null, auto_draft_enabled: false });
    expect(message(circuitLeagueSettingsBody.safeParse({}))).toBe("No fields to update");
  });

  it("settings bound roster size, clock and points", () => {
    expect(circuitLeagueSettingsBody.safeParse({ roster_size: 0 }).success).toBe(false);
    expect(circuitLeagueSettingsBody.safeParse({ roster_size: 65 }).success).toBe(false);
    expect(circuitLeagueSettingsBody.safeParse({ roster_size: 2.5 }).success).toBe(false);
    expect(circuitLeagueSettingsBody.safeParse({ pick_timer_seconds: -1 }).success).toBe(
      false
    );
    expect(circuitLeagueSettingsBody.parse({ pick_timer_seconds: 0 })).toEqual({
      pick_timer_seconds: 0
    });
    expect(circuitLeagueSettingsBody.safeParse({ nomination_points: 101 }).success).toBe(
      false
    );
    expect(circuitLeagueSettingsBody.parse({ win_bonus_points: 0 })).toEqual({
      win_bonus_points: 0
    });
    expect(
      circuitLeagueSettingsBody.safeParse({ auto_draft_enabled: "yes" }).success
    ).toBe(false);
  });

  it("events accept any subset, including none, with weight 1 by default", () => {
    expect(circuitLeagueEventsBody.parse({ events: [] })).toEqual({ events: [] });
    expect(
      circuitLeagueEventsBody.parse({
        events: [{ circuit_event_id: 1 }, { circuit_event_id: "2", weight: "1.5" }]
      })
    ).toEqual({
      events: [
        { circuit_event_id: 1, weight: 1 },
        { circuit_event_id: 2, weight: 1.5 }
      ]
    });
    expect(
      message(
        circuitLeagueEventsBody.safeParse({
          events: [{ circuit_event_id: 1 }, { circuit_event_id: 1 }]
        })
      )
    ).toBe("List each event at most once");
    expect(
      message(
        circuitLeagueEventsBody.safeParse({
          events: [{ circuit_event_id: 1, weight: 0 }]
        })
      )
    ).toBe("Enter a weight above 0");
    expect(circuitLeagueEventsBody.safeParse({}).success).toBe(false);
  });

  it("categories set weight and limit, null limit meaning unlimited", () => {
    expect(
      circuitLeagueCategoriesBody.parse({
        categories: [
          { circuit_category_id: 4, weight: 2, max_owned: 3 },
          { circuit_category_id: 5, max_owned: null }
        ]
      })
    ).toEqual({
      categories: [
        { circuit_category_id: 4, weight: 2, max_owned: 3 },
        { circuit_category_id: 5, weight: 1, max_owned: null }
      ]
    });
    expect(
      circuitLeagueCategoriesBody.safeParse({
        categories: [{ circuit_category_id: 4, max_owned: 0 }]
      }).success
    ).toBe(false);
    expect(
      message(
        circuitLeagueCategoriesBody.safeParse({
          categories: [{ circuit_category_id: 4 }, { circuit_category_id: 4 }]
        })
      )
    ).toBe("List each category at most once");
    expect(circuitLeagueCategoriesBody.safeParse({ categories: [] }).success).toBe(false);
  });
});
