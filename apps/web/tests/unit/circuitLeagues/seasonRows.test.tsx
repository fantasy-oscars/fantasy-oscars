import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { MantineProvider } from "@ui";
import { CircuitStandingsList } from "@/features/circuitLeagues/ui/CircuitStandingsList";
import { CircuitCeremonyPointsList } from "@/features/circuitLeagues/ui/CircuitCeremonyPointsList";
import { CircuitPriorityList } from "@/features/circuitLeagues/ui/CircuitPriorityList";

afterEach(cleanup);

function wrap(node: React.ReactNode) {
  return render(
    <MantineProvider>
      <MemoryRouter>{node}</MemoryRouter>
    </MantineProvider>
  );
}

/** A season list: every item a season row, none an admin row. */
function seasonRows(list: HTMLElement) {
  expect(list.className).toContain("season-list");
  expect(list.className).not.toContain("circuit-list");
  const items = within(list).getAllByRole("listitem");
  items.forEach((item) => {
    expect(item.classList.contains("season-row")).toBe(true);
    expect(item.classList.contains("circuit-row")).toBe(false);
  });
  return items;
}

describe("season lists use the season row", () => {
  it("leaderboard: rank, player, then the total as the trailing figure", () => {
    wrap(
      <CircuitStandingsList
        label="Leaderboard"
        viewerUserId={1}
        rows={[
          {
            rank: 1,
            member: { user_id: 1, username: "cora", avatar_key: "owl" },
            points: 12,
            nomination_points: 4,
            win_points: 8
          },
          {
            rank: 1,
            member: { user_id: 2, username: "emmy", avatar_key: "fox" },
            points: 12,
            nomination_points: 6,
            win_points: 6
          }
        ]}
      />
    );
    const items = seasonRows(screen.getByRole("list", { name: "Leaderboard" }));
    expect(items.map((i) => i.querySelector(".season-rowRank")?.textContent)).toEqual([
      "1",
      "1"
    ]);
    expect(items.map((i) => i.querySelector(".season-rowFigure")?.textContent)).toEqual([
      "12 pts",
      "12 pts"
    ]);
    expect(items[0]!.className).toContain("season-standingRow");
  });

  it("by ceremony: the ceremony link, then its points as trailing meta", () => {
    wrap(
      <CircuitCeremonyPointsList
        pathOf={(id) => `/points/${id}`}
        ceremonies={[
          {
            id: 7,
            code: null,
            name: "Northlight Awards",
            event: { id: 1, name: "Critics" },
            nominations_on: "2027-01-05",
            results_on: "2027-01-20",
            points_awarded: 7
          }
        ]}
      />
    );
    const [item] = seasonRows(screen.getByRole("list", { name: "Points by ceremony" }));
    expect(item!.className).toContain("season-ceremonyRow");
    expect(within(item!).getByRole("link", { name: "Northlight Awards" })).toBeTruthy();
    expect(item!.querySelector(".season-rowMeta")?.textContent).toBe("7 pts awarded");
  });

  it("waiver priority: rank and player, two lines only with a chip", () => {
    wrap(
      <CircuitPriorityList
        viewerUserId={null}
        entries={[
          {
            user_id: 1,
            username: "cora",
            avatarKey: "owl",
            waiver_priority: 1,
            chips: [
              {
                id: 3,
                member: { user_id: 1, username: "cora" },
                original_pick_number: 5,
                status: "AVAILABLE"
              }
            ]
          },
          { user_id: 2, username: "emmy", avatarKey: null, waiver_priority: 2, chips: [] }
        ]}
      />
    );
    const items = seasonRows(screen.getByRole("list", { name: "Waiver priority" }));
    expect(items.map((i) => i.querySelector(".season-rowRank")?.textContent)).toEqual([
      "1",
      "2"
    ]);
    expect(items.map((i) => i.classList.contains("is-twoLine"))).toEqual([true, false]);
    expect(items.every((i) => i.className.includes("season-priorityRow"))).toBe(true);
  });
});
