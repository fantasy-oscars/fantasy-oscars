import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { notify } from "../../../../notifications";

export function NominationFilmLinkConflictModal(props: {
  opened: boolean;
  onClose: () => void;
  filmId: number | null;
  conflict: null | {
    tmdbId: number;
    linkedFilmId: number;
    linkedFilmTitle: string | null;
  };
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
  onClear: () => void;
  onSuccess: () => void;
}) {
  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title="TMDB id already linked"
      centered
      size="md"
      overlayProps={{ opacity: 0.45, blur: 2 }}
    >
      <Stack gap="sm">
        <Text size="sm">
          {props.conflict?.linkedFilmTitle
            ? `That TMDB id is already linked to “${props.conflict.linkedFilmTitle}”.`
            : "That TMDB id is already linked to another film."}
        </Text>
        <Text size="sm" className="muted">
          If it was linked to the wrong film, you can remove it there and link it here.
        </Text>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={props.onClear}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              void (async () => {
                if (!props.filmId || !props.conflict) return;
                const { tmdbId, linkedFilmId } = props.conflict;
                const unlink = await props.onLinkFilm(linkedFilmId, null);
                if (!unlink.ok) {
                  notify({
                    id: "admin.nominees.film.unlink.other.error",
                    severity: "error",
                    trigger_type: "user_action",
                    scope: "local",
                    durability: "ephemeral",
                    requires_decision: false,
                    title: "Could not remove link",
                    message: unlink.error
                  });
                  return;
                }
                const link = await props.onLinkFilm(props.filmId, tmdbId);
                if (!link.ok) {
                  notify({
                    id: "admin.nominees.film.link.after-unlink.error",
                    severity: "error",
                    trigger_type: "user_action",
                    scope: "local",
                    durability: "ephemeral",
                    requires_decision: false,
                    title: "Could not link film",
                    message: link.error
                  });
                  return;
                }
                notify({
                  id: "admin.nominees.film.link.after-unlink.success",
                  severity: "success",
                  trigger_type: "user_action",
                  scope: "local",
                  durability: "ephemeral",
                  requires_decision: false,
                  title: "Film linked",
                  message: link.hydrated ? "Hydrated details from TMDB." : "Linked."
                });
                props.onSuccess();
              })()
            }
          >
            Remove &amp; link
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

