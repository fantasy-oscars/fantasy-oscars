import { readFileSync } from "node:fs";
import path from "node:path";

const CONTENT_DIR = path.resolve(__dirname, "../../../src/content");

export type MarkdownCase = {
  name: string;
  markdown: string;
  headingBase?: number;
};

const REPO_PAGES = [
  "about",
  "faq",
  "how-it-works",
  "code-of-conduct",
  "terms",
  "privacy",
  "disclaimer"
] as const;

/** Inputs for the rendered-output fixtures: the repo pages, a banner and the landing update. */
export const MARKDOWN_CASES: MarkdownCase[] = [
  ...REPO_PAGES.map((page) => ({
    name: `page-${page}`,
    markdown: readFileSync(path.join(CONTENT_DIR, `${page}.md`), "utf8")
  })),
  {
    name: "banner",
    markdown: "Picks lock at **8:00 pm** tonight. [Open the league](/leagues) --- now..."
  },
  {
    name: "landing-update",
    headingBase: 4,
    markdown: [
      "# What's new",
      "## Circuits",
      "Standings now carry across a *circuit* of ceremonies. See [the guide][guide].",
      "- Snake order\n- Two picks in the last round\n  - nested ~~old~~ item",
      "1. First\n2. Second",
      "> Quoted note with `code---stays`.",
      "[guide]: https://example.com/guide"
    ].join("\n\n")
  },
  {
    name: "edge-cases",
    markdown: [
      "### Deep heading",
      "#### Deeper heading",
      "##### Deepest heading",
      "<div>raw html is dropped</div>",
      "[bad](javascript:alert(1)) and [data](data:text/html;base64,AAAA) links vanish.",
      "[missing][nowhere] reference falls back to text.",
      "![image](https://example.com/a.png) is ignored.",
      "| a | b |\n| - | - |\n| 1 | 2 |",
      "Line one  \nline two after a break.",
      "---",
      "```ts\nconst a = 1 --- 2;\n```",
      "[external](https://example.com/x) and [internal](/seasons/1)."
    ].join("\n\n")
  }
];
