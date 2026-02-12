import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { screen } from "@testing-library/dom";
import { MantineProvider } from "@ui";
import { NomineePill } from "@/features/draft/ui/NomineePill";

describe("<NomineePill />", () => {
  it("renders label with truncation hint", () => {
    const longName = "A very very very long nominee name that should truncate gracefully";
    render(
      <MantineProvider>
        <NomineePill label={longName} icon="e4eb" />
      </MantineProvider>
    );

    const pill = screen.getByLabelText(longName);
    expect(pill).toHaveAttribute("title", longName);
    expect(pill).toHaveTextContent(longName);
  });

  it("applies state data attribute", () => {
    render(
      <MantineProvider>
        <NomineePill label="Nominee" state="active" />
      </MantineProvider>
    );
    const pill = screen.getByLabelText("Nominee");
    expect(pill.dataset.state).toBe("active");
  });
});
