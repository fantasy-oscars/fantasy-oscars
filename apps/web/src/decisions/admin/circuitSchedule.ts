/*
 * The Circuit editor's Schedule timeline. Pure: no IO.
 *
 * One row per day that has a scoring occasion or opens an add/drop window.
 * Scoring occasions go on the left, labelled by ceremony and, where grouped,
 * group; windows go on the right. Windows come from the API, derived from
 * every occasion as if each ceremony were enabled (ADR 0007, section 3).
 */

export type ScheduleScoringEntry = {
  ceremonyId: number;
  ceremonyLabel: string;
  groupName: string | null;
  kind: "NOMINATION" | "WIN";
};

export type ScheduleWindowEntry = {
  startsOn: string;
  endsOn: string;
  resolvesOn: string;
};

export type ScheduleDay = {
  date: string;
  scoring: ScheduleScoringEntry[];
  windows: ScheduleWindowEntry[];
};

export type ScheduleUndated = {
  ceremonyId: number;
  ceremonyLabel: string;
  groupName: string | null;
  missing: Array<"NOMINATION" | "WIN">;
};

type TimelineCeremony = {
  ceremony_id: number;
  ceremony_name: string | null;
  ceremony_code: string | null;
  event_name: string;
  event_is_group: boolean;
};

type TimelineOccasion = {
  ceremony_id: number;
  ceremony_name: string | null;
  ceremony_code: string | null;
  kind: "NOMINATION" | "WIN";
  date: string | null;
};

type TimelineWindow = { starts_on: string; ends_on: string; resolves_on: string };

function labelOf(c: {
  ceremony_name: string | null;
  ceremony_code: string | null;
  ceremony_id: number;
}) {
  return c.ceremony_name || c.ceremony_code || `Ceremony ${c.ceremony_id}`;
}

export function circuitScheduleTimeline(
  ceremonies: ReadonlyArray<TimelineCeremony>,
  occasions: ReadonlyArray<TimelineOccasion>,
  windows: ReadonlyArray<TimelineWindow>
): { days: ScheduleDay[]; undated: ScheduleUndated[] } {
  const groupNameOf = new Map(
    ceremonies.map((c) => [c.ceremony_id, c.event_is_group ? c.event_name : null])
  );
  const days = new Map<string, ScheduleDay>();
  const dayOf = (date: string) => {
    let day = days.get(date);
    if (!day) {
      day = { date, scoring: [], windows: [] };
      days.set(date, day);
    }
    return day;
  };
  const undated = new Map<number, ScheduleUndated>();

  for (const o of occasions) {
    const groupName = groupNameOf.get(o.ceremony_id) ?? null;
    if (o.date === null) {
      const entry = undated.get(o.ceremony_id) ?? {
        ceremonyId: o.ceremony_id,
        ceremonyLabel: labelOf(o),
        groupName,
        missing: []
      };
      entry.missing.push(o.kind);
      undated.set(o.ceremony_id, entry);
      continue;
    }
    dayOf(o.date).scoring.push({
      ceremonyId: o.ceremony_id,
      ceremonyLabel: labelOf(o),
      groupName,
      kind: o.kind
    });
  }
  for (const w of windows) {
    dayOf(w.starts_on).windows.push({
      startsOn: w.starts_on,
      endsOn: w.ends_on,
      resolvesOn: w.resolves_on
    });
  }

  return {
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    undated: [...undated.values()]
  };
}

const dayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric"
});

const shortDayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric"
});

function utcDate(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

/** A whole day, `YYYY-MM-DD`, as "Wed, Jan 6, 2027"; no time zone shifts it. */
export function scheduleDayLabel(day: string): string {
  return dayFormat.format(utcDate(day));
}

/** "Jan 6 – Jan 9" for a window's covered days. */
export function scheduleWindowRange(w: ScheduleWindowEntry): string {
  return `${shortDayFormat.format(utcDate(w.startsOn))} – ${shortDayFormat.format(
    utcDate(w.endsOn)
  )}`;
}

export function scheduleOccasionLabel(kind: "NOMINATION" | "WIN"): string {
  return kind === "NOMINATION" ? "Nominations" : "Ceremony";
}
