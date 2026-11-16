import { render, screen, within } from "@testing-library/react";
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

describe("<MarkdownRenderer /> heading levels", () => {
  const markdown = "# One\n\n## Two\n\n### Three\n\n#### Four";

  function headings(container: HTMLElement) {
    return within(container)
      .getAllByRole("heading")
      .map((h) => [h.textContent, h.tagName]);
  }

  test("shifts each depth one level down from h2 when headingBase is omitted", () => {
    const { container } = render(
      <MantineProvider>
        <MarkdownRenderer markdown={markdown} />
      </MantineProvider>
    );
    expect(headings(container)).toEqual([
      ["One", "H2"],
      ["Two", "H3"],
      ["Three", "H4"],
      ["Four", "H5"]
    ]);
  });

  test("gives h2, h3 and h4 their own type steps", () => {
    const { container } = render(
      <MantineProvider>
        <MarkdownRenderer markdown={markdown} />
      </MantineProvider>
    );
    const view = within(container);
    const variant = (name: string) =>
      view.getByRole("heading", { name }).getAttribute("data-fo-typo");
    expect(variant("One")).toBe("page");
    expect(variant("Two")).toBe("section");
    expect(variant("Three")).toBe("card");
  });

  test("shifts from the base and caps at h6", () => {
    const { container } = render(
      <MantineProvider>
        <MarkdownRenderer markdown={markdown} headingBase={4} />
      </MantineProvider>
    );
    expect(headings(container)).toEqual([
      ["One", "H4"],
      ["Two", "H5"],
      ["Three", "H6"],
      ["Four", "H6"]
    ]);
  });

  test("under a raised base, starts at the section size and steps down each level", () => {
    const { container } = render(
      <MantineProvider>
        <MarkdownRenderer markdown={markdown} headingBase={4} />
      </MantineProvider>
    );
    const view = within(container);
    const heading = (name: string) => view.getByRole("heading", { name });
    expect(heading("One").getAttribute("data-fo-typo")).toBe("section");
    expect(heading("Two").getAttribute("data-fo-typo")).toBe("card");
    // Below the display steps: small bold capitals in the body face.
    expect(heading("Three").getAttribute("data-fo-typo")).toBe("body");
    expect(heading("Three").getAttribute("style") ?? "").toContain("uppercase");
    expect(heading("Four").getAttribute("style") ?? "").toContain("uppercase");
  });

  test("sizes headings from the document's top heading, not the rendered level", () => {
    const { container } = render(
      <MantineProvider>
        <MarkdownRenderer markdown={"## Section\n\n### Subsection"} />
      </MantineProvider>
    );
    const view = within(container);
    const section = view.getByRole("heading", { name: "Section" });
    const subsection = view.getByRole("heading", { name: "Subsection" });
    expect([section.tagName, section.getAttribute("data-fo-typo")]).toEqual([
      "H3",
      "page"
    ]);
    expect([subsection.tagName, subsection.getAttribute("data-fo-typo")]).toEqual([
      "H4",
      "section"
    ]);
  });

  test("never renders a Markdown heading as h1", () => {
    const { container } = render(
      <MantineProvider>
        <MarkdownRenderer markdown={markdown} headingBase={1} />
      </MantineProvider>
    );
    expect(headings(container)[0]).toEqual(["One", "H2"]);
  });
});
