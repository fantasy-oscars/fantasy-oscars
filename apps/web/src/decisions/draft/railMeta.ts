/** Fewest characters a rail's pick-number column holds ("1-1" and "—" fit in three). */
const MIN_RAIL_META_CH = 3;

/**
 * Width, in `ch`, of the pick-number column shared by every row of one rail, so each pill's
 * left edge lines up. Wide enough for the longest round-pick label, never under three.
 */
export function railMetaCh(roundPicks: ReadonlyArray<string | null | undefined>): number {
  let longest = MIN_RAIL_META_CH;
  for (const pick of roundPicks) {
    if (pick && pick.length > longest) longest = pick.length;
  }
  return longest;
}
