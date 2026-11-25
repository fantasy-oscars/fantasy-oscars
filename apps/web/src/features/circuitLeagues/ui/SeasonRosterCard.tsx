import { useMemo, useRef } from "react";
import { Box, Text, VisuallyHidden } from "@ui";
import { railMetaCh } from "@/decisions/draft/railMeta";
import { StandardCard } from "@/primitives/cards/StandardCard";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";
import { useCssVars } from "@/shared/dom/useCssVars";

/**
 * The page version of the ceremony roster card, for the completed board, a
 * ceremony's points by player and the final rosters: avatar, name and a
 * score cell (a total or a count) over a list of pills. Rows with a meta
 * column (round-pick) align it as the draft rails do.
 */
export function SeasonRosterCard(props: {
  /** "pia" or "1. pia". */
  title: string;
  avatarKey: string | null;
  isViewer?: boolean;
  /** The score cell: a points total or a count such as "4 of 4". */
  score: string;
  /** The score cell's accessible name, when the bare figure needs words. */
  scoreLabel?: string;
  /** A muted line under the header: "Nominations 6 pts · Wins 2 pts". */
  summary?: string | null;
  rows: Array<{ key: string; meta?: string | null; content: React.ReactNode }>;
  emptyText: string;
  /** A muted line under the rows: the dropped-picks remainder. */
  remainder?: string | null;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const metas = props.rows.map((r) => r.meta ?? null);
  const withMeta = metas.some(Boolean);
  const metaCh = railMetaCh(metas);
  const listVars = useMemo(
    () => ({ "--dr-meta-ch": withMeta ? metaCh : null }),
    [withMeta, metaCh]
  );
  useCssVars(listRef, listVars);

  return (
    <StandardCard className="fo-pillScope fo-seasonRosterCard">
      <Box className="fo-seasonRosterCard-head">
        <AnimalAvatarIcon avatarKey={props.avatarKey} size="sm" />
        <Text className="fo-seasonRosterCard-name" title={props.title}>
          {props.title}
          {props.isViewer ? (
            <VisuallyHidden component="span">, you</VisuallyHidden>
          ) : null}
        </Text>
        <Text className="fo-seasonRosterCard-score" aria-label={props.scoreLabel}>
          {props.score}
        </Text>
      </Box>
      {props.summary ? (
        <Text className="fo-seasonRosterCard-note">{props.summary}</Text>
      ) : null}
      <Box className="fo-seasonRosterCard-rows" ref={listRef}>
        {props.rows.length === 0 ? (
          <Text className="fo-seasonRosterCard-note">{props.emptyText}</Text>
        ) : (
          props.rows.map((row) => (
            <Box
              key={row.key}
              className={["fo-seasonRosterCard-row", withMeta ? "has-meta" : ""]
                .filter(Boolean)
                .join(" ")}
            >
              {withMeta ? <Text className="dr-railMeta">{row.meta ?? ""}</Text> : null}
              {row.content}
            </Box>
          ))
        )}
      </Box>
      {props.remainder ? (
        <Text className="fo-seasonRosterCard-note">{props.remainder}</Text>
      ) : null}
    </StandardCard>
  );
}
