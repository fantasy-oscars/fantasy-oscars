import { parseMarkdown, type MarkdownTree } from "@fantasy-oscars/shared/markdown";

// Public reads parse on every request, so keep the recent trees by their source text.
// Published content is a handful of rows read on every page load; the cap only bounds
// the memory held when an admin edits many drafts.
const MAX_CACHED = 64;
const cache = new Map<string, MarkdownTree>();

/** The tree of admin-edited Markdown, parsed with the settings the web build uses. */
export function markdownTreeFor(markdown: string): MarkdownTree {
  const hit = cache.get(markdown);
  if (hit) return hit;
  const tree = parseMarkdown(markdown);
  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(markdown, tree);
  return tree;
}

/** The row with its parsed `body_tree`, for public reads. */
export function withBodyTree<T extends { body_markdown: string }>(row: T) {
  return { ...row, body_tree: markdownTreeFor(row.body_markdown) };
}
