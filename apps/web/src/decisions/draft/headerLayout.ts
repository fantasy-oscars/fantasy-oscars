import {
  DRAFT_HEADER_HYSTERESIS_ENTER_PX,
  DRAFT_HEADER_HYSTERESIS_EXIT_PX,
  DRAFT_HEADER_SIDE_PADDING_PX
} from "@/tokens/draftHeader";

/**
 * Whether the header wings no longer fit beside the centre tab. Each wing owns half of
 * what is left of the header after the side padding and the tab. Once compact, the
 * wings need more headroom to expand again, so a width on the threshold cannot flip-flop.
 */
export function shouldCompactHeader(args: {
  headerWidth: number;
  tabWidth: number;
  leftNeeded: number;
  rightNeeded: number;
  wasCompact: boolean;
}): boolean {
  const available = Math.max(0, args.headerWidth - DRAFT_HEADER_SIDE_PADDING_PX * 2);
  const wingRoom = (available - args.tabWidth) / 2;
  const headroom = args.wasCompact
    ? DRAFT_HEADER_HYSTERESIS_EXIT_PX
    : DRAFT_HEADER_HYSTERESIS_ENTER_PX;
  const limit = wingRoom - headroom;
  return args.leftNeeded > limit || args.rightNeeded > limit;
}
