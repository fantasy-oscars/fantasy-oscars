import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../../src/markdown.js";

type Node = { type: string; value?: string; children?: Node[] };

function find(node: Node, type: string): Node[] {
  return [
    ...(node.type === type ? [node] : []),
    ...(node.children ?? []).flatMap((c) => find(c, type))
  ];
}

describe("parseMarkdown", () => {
  it("parses GFM strikethrough", () => {
    expect(find(parseMarkdown("~~old~~ new") as Node, "delete")).toHaveLength(1);
  });

  it("rewrites em dashes and ellipses in text, never in code", () => {
    const tree = parseMarkdown("a --- b... `c---d`\n\n```\ne---f\n```") as Node;
    expect(find(tree, "text")[0].value).toBe("a — b… ");
    expect(find(tree, "inlineCode")[0].value).toBe("c---d");
    expect(find(tree, "code")[0].value).toBe("e---f");
  });

  it("drops source positions, so the tree stays small as JSON", () => {
    expect(JSON.stringify(parseMarkdown("# Title\n\ntext"))).not.toContain("position");
  });

  it("keeps raw HTML as an html node for the renderer to ignore", () => {
    expect(find(parseMarkdown("<b>x</b>") as Node, "html").length).toBeGreaterThan(0);
  });

  it("returns the same tree for the same text on separate calls", () => {
    const text = "# A\n\n- one\n- two\n\n[l][r]\n\n[r]: /x";
    expect(parseMarkdown(text)).toEqual(parseMarkdown(text));
  });
});
