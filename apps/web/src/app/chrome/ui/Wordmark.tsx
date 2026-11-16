import { Anchor, WordmarkTitle } from "@ui";
import type { MouseEvent } from "react";
import { Link } from "react-router-dom";

/**
 * The header wordmark: the two-tone product name as the page's one h1, linking
 * home. `onClick` sees the click before the link navigates; the caller may prevent it.
 */
export function Wordmark(props: {
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Anchor
      component={Link}
      to="/"
      className="brand"
      underline="never"
      onClick={props.onClick}
    >
      <WordmarkTitle order={1} />
    </Anchor>
  );
}
