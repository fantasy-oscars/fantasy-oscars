import { Title } from "./Title";
import type { TitleProps } from "./Title";

/** `header`: the shell's wordmark size; `hero`: the Home hero's display size. */
export type WordmarkSize = "header" | "hero";
/** `wordmark`: the brand's wordmark face; `display`: the brand's display face. */
export type WordmarkFace = "wordmark" | "display";

/**
 * The two-tone product name, "Fantasy Oscars": word one in the surrounding ink,
 * word two in the brand's tone treatment, then a full stop that only shows where
 * the brand asks for it. The heading reads as one string; the stop is decoration.
 * Size and face are props so the header and the Home hero share one structure.
 */
export function WordmarkTitle(props: {
  order: NonNullable<TitleProps["order"]>;
  size?: WordmarkSize;
  face?: WordmarkFace;
}) {
  const { order, size = "header", face = "wordmark" } = props;
  return (
    <Title
      className="site-title"
      variant={size === "hero" ? "hero" : "page"}
      order={order}
      data-size={size}
      data-face={face}
    >
      <span className="site-title-word">Fantasy</span>{" "}
      <span className="site-title-tone">
        Oscars
        <span className="site-title-stop" aria-hidden="true">
          .
        </span>
      </span>
    </Title>
  );
}
