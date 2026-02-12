import { ActionIcon, Box, Button, Group, Text, TextInput } from "@ui";
import { useState } from "react";
import { notify } from "@/notifications";
import { NominationFilmLinkConflictModal } from "@/features/admin/ui/ceremonies/nominees/NominationFilmLinkConflictModal";

export function NominationEditFilmSection(props: {
  nominationFilmTitle: string;
  film: null | { id: number; title: string; tmdb_id?: number | null };
  onLinkFilm: (
    filmId: number,
    tmdbId: number | null
  ) => Promise<
    | { ok: true; hydrated: boolean }
    | {
        ok: false;
        hydrated: boolean;
        error: string;
        errorCode?: string;
        errorDetails?: Record<string, unknown>;
      }
  >;
  onAfterLinkChange: () => void;
}) {
  const { film, nominationFilmTitle, onLinkFilm, onAfterLinkChange } = props;

  const filmId = film?.id ?? null;
  const filmLinked = Boolean(film?.tmdb_id);

  const [filmLinkOpen, setFilmLinkOpen] = useState(false);
  const [filmTmdbId, setFilmTmdbId] = useState("");
  const [filmLinkConflict, setFilmLinkConflict] = useState<{
    tmdbId: number;
    linkedFilmId: number;
    linkedFilmTitle: string | null;
  } | null>(null);

  return (
    <Box>
      <Group justify="space-between" align="center" wrap="nowrap">
        <Text fw="var(--fo-font-weight-bold)">Film</Text>
        {filmId ? (
          <Group gap="xs" wrap="nowrap">
            {!filmLinked ? (
              <Text
                component="span"
                className="gicon muted"
                aria-label="Film not linked to TMDB"
              >
                link_off
              </Text>
            ) : null}
            <ActionIcon
              variant="subtle"
              aria-label="Link film to TMDB"
              onClick={() => {
                setFilmLinkOpen((v) => !v);
                setFilmTmdbId(film?.tmdb_id ? String(film.tmdb_id) : "");
              }}
            >
              <Text component="span" className="gicon" aria-hidden="true">
                add_link
              </Text>
            </ActionIcon>
          </Group>
        ) : null}
      </Group>

      <Text className="muted" size="sm">
        {film ? film.title : nominationFilmTitle}
      </Text>
      <Text className="muted" size="xs">
        Changes here affect every nomination that references this film.
      </Text>

      {filmId && filmLinkOpen ? (
        <Group mt="xs" align="flex-end" wrap="wrap">
          <TextInput
            label="TMDB id"
            value={filmTmdbId}
            onChange={(e) => setFilmTmdbId(e.currentTarget.value)}
            placeholder="603"
          />
          {film?.tmdb_id ? (
            <ActionIcon
              variant="subtle"
              aria-label="Remove TMDB link"
              onClick={() =>
                void (async () => {
                  const r = await onLinkFilm(filmId, null);
                  if (r.ok) {
                    notify({
                      id: "admin.nominees.film.unlink.success",
                      severity: "success",
                      trigger_type: "user_action",
                      scope: "local",
                      durability: "ephemeral",
                      requires_decision: false,
                      title: "Film unlinked",
                      message: "Removed TMDB link."
                    });
                    setFilmLinkOpen(false);
                    setFilmTmdbId("");
                    onAfterLinkChange();
                  } else {
                    notify({
                      id: "admin.nominees.film.unlink.error",
                      severity: "error",
                      trigger_type: "user_action",
                      scope: "local",
                      durability: "ephemeral",
                      requires_decision: false,
                      title: "Could not unlink film",
                      message: r.error
                    });
                  }
                })()
              }
            >
              <Text component="span" className="gicon" aria-hidden="true">
                link_off
              </Text>
            </ActionIcon>
          ) : null}
          <Button
            type="button"
            onClick={() =>
              void (async () => {
                const nextTmdbId = filmTmdbId.trim() ? Number(filmTmdbId.trim()) : null;
                const r = await onLinkFilm(filmId, nextTmdbId);
                if (r.ok) {
                  notify({
                    id: "admin.nominees.film.link.success",
                    severity: "success",
                    trigger_type: "user_action",
                    scope: "local",
                    durability: "ephemeral",
                    requires_decision: false,
                    title: nextTmdbId ? "Film linked" : "Film unlinked",
                    message: nextTmdbId
                      ? r.hydrated
                        ? "Hydrated details from TMDB."
                        : "Linked."
                      : "Unlinked."
                  });
                  setFilmLinkOpen(false);
                  setFilmTmdbId("");
                  onAfterLinkChange();
                  return;
                }

                if (
                  nextTmdbId &&
                  r.errorCode === "TMDB_ID_ALREADY_LINKED" &&
                  r.errorDetails &&
                  typeof r.errorDetails.linked_film_id === "number"
                ) {
                  setFilmLinkConflict({
                    tmdbId: nextTmdbId,
                    linkedFilmId: r.errorDetails.linked_film_id,
                    linkedFilmTitle:
                      typeof r.errorDetails.linked_film_title === "string"
                        ? r.errorDetails.linked_film_title
                        : null
                  });
                  return;
                }

                notify({
                  id: "admin.nominees.film.link.error",
                  severity: "error",
                  trigger_type: "user_action",
                  scope: "local",
                  durability: "ephemeral",
                  requires_decision: false,
                  title: nextTmdbId ? "Could not link film" : "Could not unlink film",
                  message: r.error
                });
              })()
            }
          >
            Save
          </Button>
        </Group>
      ) : null}

      <NominationFilmLinkConflictModal
        opened={Boolean(filmId) && Boolean(filmLinkConflict)}
        onClose={() => setFilmLinkConflict(null)}
        filmId={filmId}
        conflict={filmLinkConflict}
        onLinkFilm={onLinkFilm}
        onClear={() => setFilmLinkConflict(null)}
        onSuccess={() => {
          setFilmLinkConflict(null);
          setFilmLinkOpen(false);
          setFilmTmdbId("");
          onAfterLinkChange();
        }}
      />
    </Box>
  );
}
