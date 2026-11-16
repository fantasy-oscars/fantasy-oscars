import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MantineProvider } from "@ui";
import { NomineeTooltipCard } from "@/features/draft/components/NomineeTooltipCard";

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
  it("sits in the header bar beside the category name, so the name wraps around it", () => {
    const { container } = renderCard(true);
    const header = container.querySelector(".fo-tip-header");
    const chip = header?.querySelector(".fo-tip-draftedChip");
    expect(chip).not.toBeNull();
    expect(chip?.getAttribute("aria-label")).toBe("Drafted by avery R3 #4");
    expect(header?.querySelector(".fo-tip-barText")?.textContent).toBe(
      "Best International Feature Film"
    );
  });

  it("is absent when the nominee is undrafted", () => {
    const { container } = renderCard(false);
    expect(container.querySelector(".fo-tip-draftedChip")).toBeNull();
  });
});
