import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { MantineProvider } from "@ui";
import { MarkdownRenderer } from "@/ui/MarkdownRenderer";

describe("<MarkdownRenderer /> typography normalization", () => {
  test("renders --- as an em dash in normal text", () => {
    render(
      <MantineProvider>
        <MarkdownRenderer markdown={"Hello --- world"} />
      </MantineProvider>
    );
    expect(screen.getByText("Hello \u2014 world")).toBeInTheDocument();
  });

  test("does not rewrite --- inside inline code", () => {
    render(
      <MantineProvider>
        <MarkdownRenderer markdown={"Use `a---b` here."} />
      </MantineProvider>
    );
    expect(screen.getByText("a---b")).toBeInTheDocument();
  });

  test("does not rewrite --- inside code blocks", () => {
    render(
      <MantineProvider>
        <MarkdownRenderer markdown={"```txt\n---\n```"} />
      </MantineProvider>
    );
    expect(screen.getByText("---")).toBeInTheDocument();
  });

  test("renders ... as an ellipsis in normal text", () => {
    render(
      <MantineProvider>
        <MarkdownRenderer markdown={"Wait... now"} />
      </MantineProvider>
    );
    expect(screen.getByText("Wait\u2026 now")).toBeInTheDocument();
  });

  test("supports GFM strikethrough", () => {
    render(
      <MantineProvider>
        <MarkdownRenderer markdown={"Use ~~old~~ new."} />
      </MantineProvider>
    );
    expect(screen.getByText("old")).toBeInTheDocument();
    // We don't assert the exact element type, just that the text is present.
  });

  test("supports reference-style links", () => {
    render(
      <MantineProvider>
        <MarkdownRenderer
          markdown={"See [TMDB][tmdb].\n\n[tmdb]: https://www.themoviedb.org"}
        />
      </MantineProvider>
    );
    const link = screen.getByRole("link", { name: "TMDB" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://www.themoviedb.org");
  });

  test("renders thematic breaks as a divider", () => {
    render(
      <MantineProvider>
        <MarkdownRenderer markdown={"Above\n\n---\n\nBelow"} />
      </MantineProvider>
    );
    expect(screen.getByText("Above")).toBeInTheDocument();
    expect(screen.getByText("Below")).toBeInTheDocument();
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });
});
