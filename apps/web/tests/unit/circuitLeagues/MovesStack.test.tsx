import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MantineProvider } from "@ui";
import { ContenderPill } from "@/features/circuitLeagues/ui/ContenderPill";
import { MovesStack } from "@/features/circuitLeagues/ui/MovesStack";
import type { CircuitMoveLine } from "@/decisions/circuitMoves";

afterEach(cleanup);

function pill(label: string) {
  return function MovePill(line: CircuitMoveLine) {
    return (
      <ContenderPill
        label={label}
        categoryName="Best Picture"
        iconCode="movie"
        iconVariant="default"
        state={line.pillState}
        movePrefix={line.label}
        tooltip={<span>card</span>}
      />
    );
  };
}

describe("MovesStack", () => {
  it("stacks the added line above the dropped one, each with a named icon", () => {
    const { container } = render(
      <MantineProvider>
        <MovesStack
          moves={[
            { key: "d", kind: "dropped", pill: pill("The Long Field") },
            { key: "a", kind: "added", pill: pill("Static") }
          ]}
        />
      </MantineProvider>
    );
    const lines = [...container.querySelectorAll(".season-move")];
    expect(lines).toHaveLength(2);
    const icons = screen.getAllByRole("img");
    expect(icons.map((i) => i.getAttribute("aria-label"))).toEqual(["Added", "Dropped"]);
    expect(icons.map((i) => i.textContent)).toEqual(["add", "remove"]);
    // Icons are not tab stops; each pill carries the move in its name.
    expect(icons.every((i) => !i.hasAttribute("tabindex"))).toBe(true);
    expect(
      screen.getByRole("group", { name: "Added: Best Picture: Static" })
    ).toBeTruthy();
    const dropped = screen.getByRole("group", {
      name: "Dropped: Best Picture: The Long Field"
    });
    expect(dropped.className).toContain("is-dropped");
  });

  it("mutes both lines of a lost claim, without the dashed dropped pill", () => {
    render(
      <MantineProvider>
        <MovesStack
          moves={[
            { key: "c", kind: "lostClaim", pill: pill("Static") },
            { key: "d", kind: "lostDrop", pill: pill("The Long Field") }
          ]}
        />
      </MantineProvider>
    );
    const lost = screen.getByRole("group", {
      name: "Would have dropped: Best Picture: The Long Field"
    });
    expect(lost.className).toContain("is-muted");
    expect(lost.className).not.toContain("is-dropped");
    expect(
      screen.getByRole("group", { name: "Claimed, lost: Best Picture: Static" }).className
    ).toContain("is-muted");
  });

  it("draws nothing without moves", () => {
    const { container } = render(
      <MantineProvider>
        <MovesStack moves={[]} />
      </MantineProvider>
    );
    expect(container.querySelector(".season-moves")).toBeNull();
  });
});
