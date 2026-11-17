import { readFile } from "node:fs/promises";
import { parseMarkdown } from "@fantasy-oscars/shared/markdown";
import type { Plugin } from "vite";

const QUERY = "?mdast";

/**
 * `import tree from "./page.md?mdast"` yields the parsed tree of the file as a plain
 * object, parsed once at build time with the same settings the API uses for
 * admin-edited content. The client bundles the tree and never the parser.
 */
export function markdownTreePlugin(): Plugin {
  return {
    name: "fo-markdown-tree",
    enforce: "pre",
    async load(id) {
      if (!id.endsWith(QUERY)) return null;
      const file = id.slice(0, -QUERY.length);
      this.addWatchFile(file);
      const tree = parseMarkdown(await readFile(file, "utf8"));
      return `export default ${JSON.stringify(tree)};`;
    }
  };
}
