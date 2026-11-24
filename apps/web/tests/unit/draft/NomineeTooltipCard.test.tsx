import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MantineProvider } from "@ui";
import { NomineeTooltipCard } from "@/shared/nominee/NomineeTooltipCard";

afterEach(cleanup);

function renderCard(drafted: boolean) {
  return render(
    <MantineProvider>
      <NomineeTooltipCard
        unitKind="FILM"
        categoryName="Best International Feature Film"
        filmTitle="Saint Marguerite of the Docks"
        draftedByLabel={drafted ? "avery" : null}
        draftedRoundPick={drafted ? "R3 #4" : null}
      />
    </MantineProvider>
  );
}

describe("NomineeTooltipCard drafted-by chip", () => {
  it("is the last item of the footer, after the TMDB logo and attribution", () => {
    const { container } = renderCard(true);
    const footer = container.querySelector(".fo-tip-footer");
    const chip = footer?.querySelector(".fo-tip-draftedChip");
    expect(chip).not.toBeNull();
    expect(chip?.getAttribute("aria-label")).toBe("Drafted by avery R3 #4");
    const order = [...(footer?.children ?? [])].map((el) =>
      ["fo-tip-tmdbLink", "fo-tip-attribution", "fo-tip-draftedChip"].find((c) =>
        el.classList.contains(c)
      )
    );
    expect(order).toEqual([
      "fo-tip-tmdbLink",
      "fo-tip-attribution",
      "fo-tip-draftedChip"
    ]);
    expect(container.querySelector(".fo-tip-header .fo-tip-draftedChip")).toBeNull();
    expect(
      container.querySelector(".fo-tip")?.classList.contains("has-draftedChip")
    ).toBe(true);
  });

  it("is absent when the nominee is undrafted", () => {
    const { container } = renderCard(false);
    expect(container.querySelector(".fo-tip-draftedChip")).toBeNull();
    expect(
      container.querySelector(".fo-tip")?.classList.contains("has-draftedChip")
    ).toBe(false);
  });
});
