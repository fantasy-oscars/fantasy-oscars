import { describe, expect, it } from "vitest";
import {
  circuitScheduleTimeline,
  scheduleDayLabel,
  scheduleWindowRange
} from "@/decisions/admin/circuitSchedule";

const ceremony = (id: number, name: string, group: string | null) => ({
  ceremony_id: id,
  ceremony_name: name,
  ceremony_code: null,
  event_name: group ?? name,
  event_is_group: group !== null
});

const occasion = (
  id: number,
  name: string,
  kind: "NOMINATION" | "WIN",
  date: string | null
) => ({
  ceremony_id: id,
  ceremony_name: name,
  ceremony_code: null,
  kind,
  date
});

describe("Circuit schedule timeline", () => {
  it("puts scoring days on the left with group names, windows on the right, by date", () => {
    const { days, undated } = circuitScheduleTimeline(
      [ceremony(1, "SAG Awards", "Guild Awards"), ceremony(2, "Golden Globes", null)],
      [
        occasion(1, "SAG Awards", "NOMINATION", "2027-01-08"),
        occasion(2, "Golden Globes", "WIN", "2027-01-06"),
        occasion(1, "SAG Awards", "WIN", "2027-02-28"),
        occasion(2, "Golden Globes", "NOMINATION", "2026-12-08")
      ],
      [
        {
          starts_on: "2026-12-08",
          ends_on: "2026-12-10",
          resolves_on: "2026-12-11"
        },
        { starts_on: "2027-01-06", ends_on: "2027-01-09", resolves_on: "2027-01-10" }
      ]
    );
    expect(days.map((d) => d.date)).toEqual([
      "2026-12-08",
      "2027-01-06",
      "2027-01-08",
      "2027-02-28"
    ]);
    expect(days[0]!.windows).toEqual([
      { startsOn: "2026-12-08", endsOn: "2026-12-10", resolvesOn: "2026-12-11" }
    ]);
    expect(days[2]).toEqual({
      date: "2027-01-08",
      scoring: [
        {
          ceremonyId: 1,
          ceremonyLabel: "SAG Awards",
          groupName: "Guild Awards",
          kind: "NOMINATION"
        }
      ],
      windows: []
    });
    expect(days[3]!.windows).toEqual([]);
    expect(undated).toEqual([]);
  });

  it("lists ceremonies without dates apart, with what they miss", () => {
    const { days, undated } = circuitScheduleTimeline(
      [ceremony(3, "BAFTA", null)],
      [
        occasion(3, "BAFTA", "NOMINATION", "2027-01-15"),
        occasion(3, "BAFTA", "WIN", null)
      ],
      []
    );
    expect(days.map((d) => d.date)).toEqual(["2027-01-15"]);
    expect(undated).toEqual([
      { ceremonyId: 3, ceremonyLabel: "BAFTA", groupName: null, missing: ["WIN"] }
    ]);
  });

  it("labels whole days without a time zone shift", () => {
    expect(scheduleDayLabel("2027-01-06")).toBe("Wed, Jan 6, 2027");
    expect(
      scheduleWindowRange({
        startsOn: "2026-12-30",
        endsOn: "2027-01-02",
        resolvesOn: "2027-01-03"
      })
    ).toBe("Dec 30 – Jan 2");
  });
});
