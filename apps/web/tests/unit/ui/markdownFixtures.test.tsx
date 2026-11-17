import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { parseMarkdown } from "@fantasy-oscars/shared/markdown";
import { MantineProvider } from "@ui";
import { MarkdownRenderer } from "@/ui/MarkdownRenderer";
import { MARKDOWN_CASES } from "./markdownCases";

// The fixtures in ./fixtures/markdown are the HTML the renderer produced when it parsed
// in the browser. Rendering the tree the shared parser builds must still match them.
const FIXTURE_DIR = path.resolve(__dirname, "fixtures/markdown");

function renderedHtml(tree: ReturnType<typeof parseMarkdown>, headingBase?: number) {
  const { container, unmount } = render(
    <MantineProvider>
      <MemoryRouter>
        <MarkdownRenderer tree={tree} headingBase={headingBase} />
      </MemoryRouter>
    </MantineProvider>
  );
  const html = container.innerHTML
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replaceAll("><", ">\n<");
  unmount();
  return `${html}\n`;
}

describe("<MarkdownRenderer /> output", () => {
  it.each(MARKDOWN_CASES)("$name renders as before", (c) => {
    const expected = readFileSync(path.join(FIXTURE_DIR, `${c.name}.html`), "utf8");
    expect(renderedHtml(parseMarkdown(c.markdown), c.headingBase)).toBe(expected);
  });

  it("survives a JSON round trip, as it does between the API and the page", () => {
    const c = MARKDOWN_CASES.find((x) => x.name === "landing-update");
    expect(c).toBeDefined();
    const tree = JSON.parse(JSON.stringify(parseMarkdown(c!.markdown)));
    const expected = readFileSync(path.join(FIXTURE_DIR, "landing-update.html"), "utf8");
    expect(renderedHtml(tree, c!.headingBase)).toBe(expected);
  });

  it("renders nothing for a missing tree", () => {
    expect(renderedHtml(null as never)).not.toContain("<p");
  });

  it("never renders raw HTML or unsafe links", () => {
    const html = renderedHtml(
      parseMarkdown("<script>alert(1)</script>\n\n[x](javascript:alert(1))")
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
  });
});
