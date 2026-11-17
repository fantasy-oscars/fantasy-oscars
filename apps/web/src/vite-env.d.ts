/// <reference types="vite/client" />

declare module "*.md?mdast" {
  import type { Root } from "mdast";
  /** The Markdown file parsed at build time (see `vite/markdownTree.ts`). */
  const tree: Root;
  export default tree;
}

declare module "virtual:fo-brand.css";
declare module "virtual:fo-fonts.css";

interface ImportMetaEnv {
  /** Set to "1" by the visual and e2e builds to include the `/__specimen` route. */
  readonly VITE_FO_ENABLE_SPECIMEN?: string;
}
