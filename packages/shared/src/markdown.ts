import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root } from "mdast";

export type { Root as MarkdownTree } from "mdast";

/**
 * The one place Markdown becomes a tree. The API parses admin-edited content with it,
 * the web build parses the repo's pages with it, and the admin editor's live preview
 * parses with it in the browser, so all three produce the same tree. The web client
 * renders trees and never parses outside the editor.
 */

function applyTypographyReplacementsToText(value: string): string {
  // Minimal, explicit typography normalization.
  // - We only rewrite the Markdown author's ASCII punctuation into typographic glyphs.
  // - This runs only on Markdown "text" nodes (never code/inlineCode).
  return (
    value
      // Em dash: users often type `---`.
      .replaceAll("---", "—")
      // Ellipsis: `...`.
      .replaceAll("...", "…")
  );
}

/**
 * Normalizes a freshly parsed tree in place: typography on text nodes, and source
 * positions dropped (nothing renders from them, and they would double the JSON).
 */
function normalizeTree(node: unknown): void {
  if (!node || typeof node !== "object") return;
  const n = node as {
    type?: string;
    value?: unknown;
    position?: unknown;
    children?: unknown[];
  };

  delete n.position;

  if (n.type === "text" && typeof n.value === "string") {
    n.value = applyTypographyReplacementsToText(n.value);
  }

  // Never touch code surfaces.
  if (n.type === "code" || n.type === "inlineCode") return;

  if (Array.isArray(n.children)) {
    for (const child of n.children) normalizeTree(child);
  }
}

const processor = unified().use(remarkParse).use(remarkGfm);

export function parseMarkdown(markdown: string): Root {
  const tree = processor.parse(markdown) as Root;
  normalizeTree(tree);
  return tree;
}
