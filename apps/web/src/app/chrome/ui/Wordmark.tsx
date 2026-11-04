import { Anchor, Title } from "@ui";
import { Link } from "react-router-dom";

/**
 * The two-tone wordmark. The text stays one accessible string, "Fantasy Oscars";
 * the full stop is decoration and only shows where the brand asks for it.
 */
export function Wordmark() {
  return (
    <Anchor component={Link} to="/" className="brand" underline="never">
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
