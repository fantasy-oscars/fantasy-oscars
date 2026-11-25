import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MantineProvider } from "@ui";
import { circuitPointsSection } from "@/decisions/circuitPoints";
import {
  ContenderPill,
  ContenderPillCaption
} from "@/features/circuitLeagues/ui/ContenderPill";
import { SeasonRosterCard } from "@/features/circuitLeagues/ui/SeasonRosterCard";
import { NomineeTooltipCard } from "@/shared/nominee/NomineeTooltipCard";

afterEach(cleanup);

function wrap(node: React.ReactNode) {
  return render(<MantineProvider>{node}</MantineProvider>);
}

describe("ContenderPill", () => {
  it("draws the ceremony's static pill with icon, label, points and a full name", () => {
    wrap(
      <ContenderPill
        label="Night Train (2026)"
        categoryName="Best Picture"
        iconCode="movie"
        iconVariant="default"
        points={3}
        pointsLabel="+3"
        winner
        tooltip={<span>card</span>}
      />
    );
    const pill = screen.getByRole("group", {
      name: "Best Picture: Night Train (2026), 3 points"
    });
    expect(pill.className).toContain("dr-pill dr-pill-static is-winner");
    expect(pill.getAttribute("tabindex")).toBe("0");
    expect(pill.querySelector(".dr-pill-icon")?.textContent).toBe("movie");
    expect(pill.querySelector(".dr-pill-text")?.getAttribute("title")).toBe(
      "Night Train (2026)"
    );
    expect(pill.querySelector(".dr-pill-points")?.textContent).toBe("+3");
  });

  it("keeps a category icon when the category has none, and is not focusable without a card", () => {
    wrap(
      <ContenderPill
        label="Static (2026)"
        categoryName="Best Sound"
        iconCode={null}
        iconVariant="default"
      />
    );
    const pill = screen.getByRole("group", { name: "Best Sound: Static (2026)" });
    expect(pill.querySelector(".dr-pill-icon")?.textContent).not.toBe("");
    expect(pill.hasAttribute("tabindex")).toBe(false);
    expect(pill.querySelector(".dr-pill-points")).toBeNull();
  });

  it("combines won and dropped, but never muted and won", () => {
    wrap(
      <>
        <ContenderPill
          label="A (2026)"
          categoryName="Best Picture"
          iconCode="movie"
          iconVariant="default"
          state="dropped"
          winner
          stateSuffix="dropped"
        />
        <ContenderPill
          label="B (2026)"
          categoryName="Best Picture"
          iconCode="movie"
          iconVariant="default"
          state="muted"
          winner
          stateSuffix="owned by pia"
        />
        <ContenderPillCaption>Owned by pia</ContenderPillCaption>
      </>
    );
    const dropped = screen.getByRole("group", {
      name: "Best Picture: A (2026), dropped"
    });
    expect(dropped.className).toContain("is-dropped");
    expect(dropped.className).toContain("is-winner");
    const muted = screen.getByRole("group", {
      name: "Best Picture: B (2026), owned by pia"
    });
    expect(muted.className).toContain("is-muted");
    expect(muted.className).not.toContain("is-winner");
    expect(screen.getByText("Owned by pia").className).toContain("dr-pill-caption");
  });
});

describe("SeasonRosterCard", () => {
  it("shows the header, rows with round-picks, and the remainder", () => {
    const { container } = wrap(
      <SeasonRosterCard
        title="1. pia"
        avatarKey="owl"
        isViewer
        score="12"
        summary="Nominations 6 pts · Wins 6 pts"
        rows={[
          { key: "a", meta: "1-1", content: <span>first</span> },
          { key: "b", meta: "12-10", content: <span>second</span> }
        ]}
        emptyText="No points at this ceremony."
        remainder="Plus 2 pts from picks dropped during the season."
      />
    );
    const card = container.querySelector(".fo-seasonRosterCard")!;
    expect(card.className).toContain("fo-pillScope");
    // No visible "(you)": the viewer's ", you" is visually hidden text.
    const name = card.querySelector(".fo-seasonRosterCard-name")!;
    expect(name.textContent).toBe("1. pia, you");
    expect(name.getAttribute("title")).toBe("1. pia");
    expect(card.querySelector(".fo-seasonRosterCard-score")?.textContent).toBe("12");
    const rows = card.querySelectorAll(".fo-seasonRosterCard-row.has-meta");
    expect([...rows].map((r) => r.querySelector(".dr-railMeta")?.textContent)).toEqual([
      "1-1",
      "12-10"
    ]);
    // The meta column fits the longest round-pick, as the rails do.
    const list = card.querySelector<HTMLElement>(".fo-seasonRosterCard-rows")!;
    expect(list.style.getPropertyValue("--dr-meta-ch")).toBe("5");
    expect(
      screen.getByText("Plus 2 pts from picks dropped during the season.")
    ).toBeTruthy();
  });

  it("says so when there are no rows", () => {
    wrap(
      <SeasonRosterCard
        title="cy"
        avatarKey={null}
        score="0"
        rows={[]}
        emptyText="No points at this ceremony."
      />
    );
    expect(screen.getByText("No points at this ceremony.")).toBeTruthy();
  });
});

describe("NomineeTooltipCard points section", () => {
  it("sits between the body and the footer, with lines and a total", () => {
    const { container } = wrap(
      <NomineeTooltipCard
        unitKind="FILM"
        categoryName="Best Picture"
        filmTitle="Night Train"
        pointsSection={circuitPointsSection({
          playerName: "pia",
          lines: [
            { ceremony_id: 1, ceremony_name: "Golden Reel 2027", nomination: 1, win: 2 },
            { ceremony_id: 2, ceremony_name: "Directors Guild", nomination: 1.5, win: 0 }
          ]
        })}
      />
    );
    const order = [...container.querySelector(".fo-tip")!.children].map(
      (el) => el.className.split(" ").find((c) => c.startsWith("fo-tip-")) ?? ""
    );
    expect(order).toEqual(["fo-tip-bar", "fo-tip-body", "fo-tip-points", "fo-tip-bar"]);
    const points = container.querySelector(".fo-tip-points") as HTMLElement;
    expect(within(points).getByText("Points for pia")).toBeTruthy();
    expect(within(points).getByText("Nomination +1 · Win +2")).toBeTruthy();
    const lines = points.querySelectorAll(".fo-tip-pointsLine");
    expect(
      [...lines].map((l) => l.querySelector(".fo-tip-pointsTotal")?.textContent)
    ).toEqual(["+3", "+1.5", "+4.5"]);
  });

  it("says when there are no points, and is absent without a section", () => {
    const { container } = wrap(
      <>
        <NomineeTooltipCard
          unitKind="FILM"
          categoryName="Best Picture"
          filmTitle="Night Train"
          pointsSection={circuitPointsSection({ playerName: null, lines: [] })}
        />
        <NomineeTooltipCard
          unitKind="FILM"
          categoryName="Best Sound"
          filmTitle="Static"
        />
      </>
    );
    expect(screen.getByText("No points yet.")).toBeTruthy();
    expect(container.querySelectorAll(".fo-tip-points")).toHaveLength(1);
  });
});
