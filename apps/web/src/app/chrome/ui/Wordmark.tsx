import { Anchor, Title } from "@ui";
import type { MouseEvent } from "react";
import { Link } from "react-router-dom";

/**
 * The two-tone wordmark. The text stays one accessible string, "Fantasy Oscars";
 * the full stop is decoration and only shows where the brand asks for it.
 * `onClick` sees the click before the link navigates; the caller may prevent it.
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
      <Title className="site-title" order={1}>
        <span className="site-title-word">Fantasy</span>{" "}
        <span className="site-title-tone">
          Oscars
          <span className="site-title-stop" aria-hidden="true">
            .
          </span>
        </span>
      </Title>
    </Anchor>
  );
}
