import { describe, expect, it } from "vitest";
import { circuitTransactionRows } from "@/decisions/circuitTransactions";
import { circuitLeagueDetail, circuitSelection } from "../circuitLeagues/fixtures";

const detail = circuitLeagueDetail({ status: "IN_SEASON" });

describe("circuit transaction rows", () => {
  it("draws each move as a pill and names the kind, with the member's avatar", () => {
    const [row] = circuitTransactionRows(
      [
        {
          id: 4,
          kind: "WAIVER",
          occurred_at: "2026-12-03T08:00:00Z",
          member: { user_id: 5, username: "avery" },
          add: circuitSelection(2, "Paper Moon", "Ada Lane"),
          drop: circuitSelection(1, "Night Train")
        }
      ],
      detail.categories,
      [{ user_id: 5, avatar_key: "fox" }]
    );
    expect(row).toMatchObject({
      key: 4,
      username: "avery",
      avatarKey: "fox",
      kindLabel: "Waiver claim",
      occurredAt: "2026-12-03T08:00:00Z",
      add: {
        label: "Ada Lane, Paper Moon (2026)",
        categoryName: "Best Actress",
        iconCode: "person"
      },
      drop: { label: "Night Train (2026)", categoryName: "Best Picture" }
    });
    expect(row!.timeTitle).toContain("2026");
  });

  it("leaves out a move that did not happen and an unknown avatar", () => {
    const [row] = circuitTransactionRows(
      [
        {
          id: 3,
          kind: "DROP",
          occurred_at: "2026-12-02T08:00:00Z",
          member: { user_id: 9, username: "blake" },
          add: null,
          drop: circuitSelection(1, "Night Train")
        }
      ],
      detail.categories,
      detail.members
    );
    expect(row).toMatchObject({ avatarKey: null, kindLabel: "Drop", add: null });
  });
});
