import { useMemo } from "react";
import { parseMarkdown } from "@fantasy-oscars/shared/markdown";
import { Markdown } from "@ui/Markdown";

/**
 * The editor's live preview. It parses in the browser, so the parser lives only in
 * this module; the editor loads it lazily and no other screen pulls it in.
 */
export function MarkdownPreview(props: { markdown: string; headingBase?: number }) {
  const { markdown, headingBase } = props;
  const tree = useMemo(() => parseMarkdown(markdown), [markdown]);
  return <Markdown tree={tree} headingBase={headingBase} />;
}
