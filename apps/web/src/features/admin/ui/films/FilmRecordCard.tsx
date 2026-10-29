import { ActionIcon, Box, Checkbox, Group, Text, Tooltip } from "@ui";
import { StandardCard } from "@/primitives/cards/StandardCard";
import type { FilmDisplayRow } from "@/decisions/films/filmGroups";
import type { AdminFilmRow } from "@/orchestration/admin/filmsIndex/orchestration";
import "@/primitives/baseline.css";

export function FilmRecordCard(props: {
  row: FilmDisplayRow<AdminFilmRow>;
  checked: boolean;
  indeterminate: boolean;
  onToggle: (checked: boolean) => void;
  onOpenGroup: (normTitle: string) => void;
  onManageConsolidated: (film: AdminFilmRow) => void;
  onEditTmdbLink: (film: AdminFilmRow) => void;
}) {
  const { row } = props;
  const film = row.type === "film" ? row.film : row.representative;
  const isGroup = row.type === "group";

  return (
    <StandardCard>
      <Group justify="space-between" align="center" wrap="wrap">
        <Group align="center" gap="sm" wrap="nowrap" miw="var(--fo-space-0)">
          <Checkbox
            aria-label={
              isGroup ? "Select consolidated film records" : "Select film record"
            }
            checked={props.checked}
            indeterminate={props.indeterminate}
            onChange={(e) => props.onToggle(e.currentTarget.checked)}
          />
          <Box miw="var(--fo-space-0)">
            <Text fw="var(--fo-font-weight-bold)" className="baseline-textBody">
              {film.title}
              {film.release_year ? ` (${film.release_year})` : ""}
            </Text>
            {isGroup ? (
              <Text className="baseline-textMeta">
                Consolidates {row.group.films.length} duplicate entries
              </Text>
            ) : null}
          </Box>
        </Group>

        <Group gap="xs" wrap="wrap" justify="flex-end">
          {film.is_nominated ? (
            <Tooltip label="Nominated in at least one ceremony" withArrow>
              <Box component="span" className="baseline-statusPill" aria-hidden="true">
                <Text component="span" className="gicon" aria-hidden="true">
                  star
                </Text>
              </Box>
            </Tooltip>
          ) : null}

          {isGroup ? (
            <Tooltip label="View grouped records" withArrow>
              <ActionIcon
                variant="subtle"
                aria-label="Open grouped records"
                onClick={() => props.onOpenGroup(row.group.normTitle)}
              >
                <Text component="span" className="gicon" aria-hidden="true">
                  layers
                </Text>
              </ActionIcon>
            </Tooltip>
          ) : film.is_consolidated ? (
            <Tooltip label="Manage consolidated records" withArrow>
              <ActionIcon
                variant="subtle"
                aria-label="Manage consolidated records"
                onClick={() => props.onManageConsolidated(film)}
              >
                <Text component="span" className="gicon" aria-hidden="true">
                  layers
                </Text>
              </ActionIcon>
            </Tooltip>
          ) : null}

          <Tooltip
            label={film.tmdb_id ? "Linked to TMDB (edit link)" : "Not linked to TMDB"}
            withArrow
          >
            <ActionIcon
              variant="subtle"
              aria-label={film.tmdb_id ? "Edit TMDB link" : "Link to TMDB"}
              onClick={() => props.onEditTmdbLink(film)}
            >
              <Text
                component="span"
                className={film.tmdb_id ? "gicon" : "gicon muted"}
                aria-hidden="true"
              >
                {film.tmdb_id ? "link" : "link_off"}
              </Text>
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
    </StandardCard>
  );
}
