import { describe, expect, it } from "vitest";
import { markdownTreeFor, withBodyTree } from "../../../src/services/markdownTree.js";

describe("markdownTreeFor", () => {
  it("parses the Markdown into a root tree", () => {
    const tree = markdownTreeFor("# Title\n\ntext");
    expect(tree.type).toBe("root");
    expect(tree.children.map((c) => c.type)).toEqual(["heading", "paragraph"]);
  });

  it("reuses the tree for the same text", () => {
    expect(markdownTreeFor("same text")).toBe(markdownTreeFor("same text"));
  });

  it("keeps working past the cache limit", () => {
    for (let i = 0; i < 200; i += 1) markdownTreeFor(`entry ${i}`);
    expect(markdownTreeFor("entry 0").type).toBe("root");
  });
});

describe("withBodyTree", () => {
  it("adds the tree and keeps the row's own fields", () => {
    const out = withBodyTree({ id: 3, body_markdown: "hi" });
    expect(out.id).toBe(3);
    expect(out.body_markdown).toBe("hi");
    expect(out.body_tree.children).toHaveLength(1);
  });
});
