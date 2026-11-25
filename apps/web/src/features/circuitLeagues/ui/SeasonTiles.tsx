import { useId } from "react";
import { Link } from "react-router-dom";
import { Box, Skeleton, Text } from "@ui";
import type { CircuitSeasonTile } from "@/decisions/circuitSeasonTiles";
import { StandardCard } from "@/primitives";

export type SeasonTileLink = CircuitSeasonTile & { to: string };

/**
 * The season page's parts as a row of tiles, each a link named by its title
 * and described by its line (and note), with a trailing chevron. Three across
 * from 768 px, one column on a phone.
 */
export function SeasonTiles(props: { tiles: SeasonTileLink[] }) {
  const base = useId();
  return (
    <Box component="nav" aria-label="Season">
      <Box component="ul" className={["season-tiles", "fo-listReset"].join(" ")}>
        {props.tiles.map((tile) => {
          const titleId = `${base}-${tile.key}-title`;
          const descId = `${base}-${tile.key}-desc`;
          const noteId = `${base}-${tile.key}-note`;
          return (
            <li key={tile.key}>
              <StandardCard
                interactive
                component={Link}
                to={tile.to}
                className="season-tile"
                aria-labelledby={titleId}
                aria-describedby={tile.note ? `${descId} ${noteId}` : descId}
              >
                <Box className="season-tileText">
                  <Text id={titleId} className="baseline-textCardTitle season-tileTitle">
                    {tile.title}
                  </Text>
                  <Text id={descId} className="baseline-textMeta">
                    {tile.description}
                  </Text>
                  {tile.note ? (
                    <Text id={noteId} className="baseline-textBody">
                      {tile.note}
                    </Text>
                  ) : null}
                </Box>
                <Text
                  component="span"
                  className="gicon season-tileChevron"
                  aria-hidden="true"
                >
                  chevron_right
                </Text>
              </StandardCard>
            </li>
          );
        })}
      </Box>
    </Box>
  );
}

/** Three tile-height blocks in the tiles' grid, for the page skeleton. */
export function SeasonTilesSkeleton() {
  return (
    <Box className="season-tiles">
      {Array.from({ length: 3 }).map((_, idx) => (
        <Skeleton key={idx} height="72px" width="100%" />
      ))}
    </Box>
  );
}
