import { describe, expect, it } from "vitest";
import { instantOfDay } from "../../../src/domain/circuit.js";
import { matchOccasion } from "../../../src/domain/circuitMatching.js";
import {
  roundPoints,
  scoreOccasion,
  type ScoringInterval,
  type ScoringMatch,
  type ScoringMatrix,
  type ScoringOccasionInput
} from "../../../src/domain/circuitScoring.js";

const at = (iso: string) => new Date(iso);
const LATER = at("2027-06-01T00:00:00Z");

const EVENT = 10;
const CATEGORY = 100;
const NOMINATION_DAY = "2027-01-21";
const WIN_DAY = "2027-03-14";

const matrix = (over: Partial<ScoringMatrix> = {}): ScoringMatrix => ({
  nomination_points: 1,
  win_bonus_points: 2,
  event_weights: new Map([[EVENT, 1]]),
  category_weights: new Map(),
  ...over
});

const occasion = (
  kind: "NOMINATION" | "WIN",
  date: string | null = kind === "NOMINATION" ? NOMINATION_DAY : WIN_DAY
): ScoringOccasionInput => ({ ceremony_id: 5, kind, circuit_event_id: EVENT, date });

const match = (selectionId: number, categoryId = CATEGORY): ScoringMatch => ({
  selection_id: selectionId,
  nomination_ids: [900 + selectionId],
  circuit_category_id: categoryId
});

const interval = (
  id: number,
  memberId: number,
  selectionId: number,
  acquired: Date,
  released: Date | null = null
): ScoringInterval => ({
  id,
  member_id: memberId,
  selection_id: selectionId,
  acquired_at: acquired,
  released_at: released
});

const DRAFTED = at("2026-12-04T03:00:00Z");

function total(entries: ReturnType<typeof scoreOccasion>, memberId: number) {
  return entries
    .filter((e) => e.member_id === memberId)
    .reduce((sum, e) => sum + e.points, 0);
}

describe("scoreOccasion", () => {
  it("credits the owner at 00:00 Pacific on the occasion's date", () => {
    const instant = instantOfDay(NOMINATION_DAY);
    const intervals = [
      // Member 1 held selection 7 until the instant itself: not held at it.
      interval(1, 1, 7, DRAFTED, instant),
      interval(2, 2, 7, instant),
      // Member 3 released selection 8 a millisecond after the instant.
      interval(3, 3, 8, DRAFTED, new Date(instant.getTime() + 1))
    ];
    const entries = scoreOccasion(
      intervals,
      occasion("NOMINATION"),
      [match(7), match(8)],
      matrix(),
      LATER
    );
    expect(entries).toEqual([
      {
        member_id: 2,
        selection_id: 7,
        ceremony_id: 5,
        kind: "NOMINATION",
        occasion_date: NOMINATION_DAY,
        points: 1,
        ownership_id: 2
      },
      {
        member_id: 3,
        selection_id: 8,
        ceremony_id: 5,
        kind: "NOMINATION",
        occasion_date: NOMINATION_DAY,
        points: 1,
        ownership_id: 3
      }
    ]);
  });

  it("keeps the nomination point with its owner when the selection moves before the win", () => {
    const dropped = at("2027-02-01T18:00:00Z");
    const intervals = [interval(1, 1, 7, DRAFTED, dropped), interval(2, 2, 7, dropped)];
    const nomination = scoreOccasion(
      intervals,
      occasion("NOMINATION"),
      [match(7)],
      matrix(),
      LATER
    );
    const win = scoreOccasion(intervals, occasion("WIN"), [match(7)], matrix(), LATER);
    expect(nomination.map((e) => [e.member_id, e.points])).toEqual([[1, 1]]);
    expect(win.map((e) => [e.member_id, e.points])).toEqual([[2, 2]]);
  });

  it("gives a nominated winner owned throughout 3 points", () => {
    const intervals = [interval(1, 1, 7, DRAFTED)];
    const entries = [
      ...scoreOccasion(intervals, occasion("NOMINATION"), [match(7)], matrix(), LATER),
      ...scoreOccasion(intervals, occasion("WIN"), [match(7)], matrix(), LATER)
    ];
    expect(total(entries, 1)).toBe(3);
  });

  it("scores nominations and wins on one day together, at the same instant", () => {
    const day = "2027-01-11";
    // Dropped in the afternoon of the shared day: both occasions stay earned.
    const intervals = [
      interval(1, 1, 7, DRAFTED, at("2027-01-11T22:00:00Z")),
      interval(2, 2, 7, at("2027-01-11T22:00:00Z"))
    ];
    const entries = [
      ...scoreOccasion(
        intervals,
        occasion("NOMINATION", day),
        [match(7)],
        matrix(),
        LATER
      ),
      ...scoreOccasion(intervals, occasion("WIN", day), [match(7)], matrix(), LATER)
    ];
    expect(entries.map((e) => [e.kind, e.member_id])).toEqual([
      ["NOMINATION", 1],
      ["WIN", 1]
    ]);
    expect(total(entries, 1)).toBe(3);
  });

  it("gives nothing to a league that drafted after the occasion or on its day", () => {
    const afterwards = [interval(1, 1, 7, at("2027-01-25T03:00:00Z"))];
    // 10:00 Pacific on the nominations day, after that day's instant.
    const sameDay = [interval(1, 1, 7, at("2027-01-21T18:00:00Z"))];
    for (const intervals of [afterwards, sameDay]) {
      expect(
        scoreOccasion(intervals, occasion("NOMINATION"), [match(7)], matrix(), LATER)
      ).toEqual([]);
    }
  });

  it("never scores a disabled event or an undated occasion", () => {
    const intervals = [interval(1, 1, 7, DRAFTED)];
    expect(
      scoreOccasion(
        intervals,
        occasion("NOMINATION"),
        [match(7)],
        matrix({ event_weights: new Map([[EVENT + 1, 1]]) }),
        LATER
      )
    ).toEqual([]);
    expect(
      scoreOccasion(intervals, occasion("WIN", null), [match(7)], matrix(), LATER)
    ).toEqual([]);
  });

  it("does not score an occasion whose instant is still ahead", () => {
    const intervals = [interval(1, 1, 7, DRAFTED)];
    const justBefore = new Date(instantOfDay(NOMINATION_DAY).getTime() - 1);
    expect(
      scoreOccasion(intervals, occasion("NOMINATION"), [match(7)], matrix(), justBefore)
    ).toEqual([]);
    expect(
      scoreOccasion(
        intervals,
        occasion("NOMINATION"),
        [match(7)],
        matrix(),
        instantOfDay(NOMINATION_DAY)
      )
    ).toHaveLength(1);
  });

  it("multiplies base points by the category and event weights", () => {
    const intervals = [interval(1, 1, 7, DRAFTED), interval(2, 1, 8, DRAFTED)];
    const weighted = matrix({
      win_bonus_points: 2,
      event_weights: new Map([[EVENT, 2]]),
      category_weights: new Map([[CATEGORY, 1.5]])
    });
    const entries = scoreOccasion(
      intervals,
      occasion("WIN"),
      [match(7), match(8, 101)],
      weighted,
      LATER
    );
    // 2 × 1.5 × 2 for the weighted category; 2 × 1 × 2 for an unweighted one.
    expect(entries.map((e) => e.points)).toEqual([6, 4]);
  });

  it("rounds points to the ledger's two decimals", () => {
    expect(roundPoints(1 / 3)).toBe(0.33);
    const entries = scoreOccasion(
      [interval(1, 1, 7, DRAFTED)],
      occasion("NOMINATION"),
      [match(7)],
      matrix({ category_weights: new Map([[CATEGORY, 1 / 3]]) }),
      LATER
    );
    expect(entries[0]?.points).toBe(0.33);
  });

  it("scores a selection once per occasion even with two mapped editions", () => {
    const matches = matchOccasion({
      kind: "NOMINATION",
      mappings: [
        { category_edition_id: 1, circuit_category_id: CATEGORY },
        { category_edition_id: 2, circuit_category_id: CATEGORY }
      ],
      nominations: [
        {
          id: 11,
          category_edition_id: 1,
          film_id: 50,
          status: "ACTIVE",
          person_tmdb_ids: []
        },
        {
          id: 12,
          category_edition_id: 2,
          film_id: 50,
          status: "ACTIVE",
          person_tmdb_ids: []
        }
      ],
      films: [{ id: 50, tmdb_id: 5000, consolidated_into_film_id: null }],
      selections: [
        {
          id: 7,
          circuit_category_id: CATEGORY,
          kind: "FILM",
          film_tmdb_id: 5000,
          person_tmdb_id: null
        }
      ]
    }).map((m) => ({ ...m, circuit_category_id: CATEGORY }));
    const entries = scoreOccasion(
      [interval(1, 1, 7, DRAFTED)],
      occasion("NOMINATION"),
      [...matches, ...matches],
      matrix(),
      LATER
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.points).toBe(1);
  });

  it("is deterministic: the same inputs give the same entries", () => {
    const intervals = [interval(2, 2, 8, DRAFTED), interval(1, 1, 7, DRAFTED)];
    const run = () =>
      scoreOccasion(intervals, occasion("WIN"), [match(8), match(7)], matrix(), LATER);
    expect(run()).toEqual(run());
    expect(run().map((e) => e.selection_id)).toEqual([7, 8]);
  });
});
