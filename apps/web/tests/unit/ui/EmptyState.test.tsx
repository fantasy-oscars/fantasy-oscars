import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MantineProvider } from "@ui";
import { EmptyState } from "@/primitives";
import { AlertIcon } from "@/shared/AlertIcon";

afterEach(cleanup);

describe("EmptyState", () => {
  it("renders its message in the placeholder box", () => {
    render(
      <MantineProvider>
        <EmptyState>No leagues yet.</EmptyState>
      </MantineProvider>
    );
    const el = screen.getByText("No leagues yet.");
    expect(el.classList.contains("baseline-emptyState")).toBe(true);
  });
});

describe("AlertIcon", () => {
  it("renders the variant glyph hidden from assistive tech", () => {
    render(
      <MantineProvider>
        <AlertIcon variant="warning" />
      </MantineProvider>
    );
    const el = screen.getByText("warning");
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });
});
