import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { MantineProvider } from "@mantine/core";

describe("<MarkdownRenderer /> typography shortcuts", () => {
  it("replaces common ASCII shortcuts in text nodes", () => {
    const { container } = render(
      <MantineProvider>
        <MarkdownRenderer markdown={"Hello --- world... (c) (r) (tm)"} />
      </MantineProvider>
    );
    expect(container.textContent).toContain("Hello — world… © ® ™");
  });

  it("does not modify inline code", () => {
    const { container } = render(
      <MantineProvider>
        <MarkdownRenderer markdown={"Code: `---` and `...`"} />
      </MantineProvider>
    );
    expect(container.textContent).toContain("Code: --- and ...");
  });
});
