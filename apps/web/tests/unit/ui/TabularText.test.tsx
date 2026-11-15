import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TabularText } from "@/ui/TabularText";

afterEach(cleanup);

describe("TabularText", () => {
  it("wraps each digit in a fixed-width cell and nothing else", () => {
    const { container } = render(<TabularText text="1:30 • 119s left" />);
    const digits = Array.from(container.querySelectorAll(".dr-digit")).map(
      (el) => el.textContent
    );
    expect(digits).toEqual(["1", "3", "0", "1", "1", "9"]);
    expect(container.textContent).toBe("1:30 • 119s left");
  });

  it("renders text without digits as plain text", () => {
    const { container } = render(<TabularText text="Paused" />);
    expect(container.querySelector(".dr-digit")).toBeNull();
    expect(container.textContent).toBe("Paused");
  });
});
