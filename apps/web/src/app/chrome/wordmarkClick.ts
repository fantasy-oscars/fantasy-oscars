import type { MouseEvent } from "react";
import { decideWordmarkShuffle } from "@/decisions/appearance";

/**
 * Wordmark click glue: on Home a plain click shuffles the theme and the link
 * does not navigate; anything else, or a shuffle with nothing to show, is an
 * ordinary link click.
 */
export function handleWordmarkClick(
  event: MouseEvent<HTMLAnchorElement>,
  pathname: string,
  shuffle: () => "shuffled" | "busy" | "none"
): void {
  const plainOnHome = decideWordmarkShuffle({
    button: event.button,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    pathname
  });
  if (plainOnHome && shuffle() !== "none") event.preventDefault();
}
