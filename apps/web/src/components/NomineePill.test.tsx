import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { screen } from "@testing-library/dom";
import { NomineePill } from "./NomineePill";

describe("<NomineePill />", () => {
  it("renders name and category with truncation hint", () => {
    const longName = "A very very very long nominee name that should truncate gracefully";
    render(<NomineePill name={longName} category="Best Picture" />);

    const pill = screen.getByLabelText(longName);
    expect(pill).toHaveAttribute("title", longName);
    expect(pill).toHaveTextContent("Best Picture");
  });

  it("applies state data attribute", () => {
    render(<NomineePill name="Nominee" state="active" />);
    const pill = screen.getByLabelText("Nominee");
    expect(pill.dataset.state).toBe("active");
  });
});
