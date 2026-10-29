import { ActionIcon, Box, Button, Group, Modal, Stack, Text } from "@ui";
import { StandardCard } from "@/primitives/cards/StandardCard";
import type { AdminFilmRow } from "@/orchestration/admin/filmsIndex/orchestration";
import "@/primitives/baseline.css";

export type FilmGroupsController = {
  openGroup: { films: AdminFilmRow[] } | null;
  pagedGroupFilms: AdminFilmRow[];
  clampedGroupPage: number;
  groupPageCount: number;
  closeGroupModal: () => void;
  decouple: (filmId: number) => void;
  previousGroupPage: () => void;
  nextGroupPage: () => void;
};

export function GroupedRecordsModal(props: { groups: FilmGroupsController }) {
  const { groups } = props;
  const group = groups.openGroup;
  return (
    <Modal
      opened={Boolean(group)}
      onClose={groups.closeGroupModal}
      title="Grouped records"
      centered
      size="lg"
      overlayProps={{ opacity: 0.35, blur: 2 }}
    >
      <Stack gap="sm">
        {group ? (
          <>
            <Text className="baseline-textMeta">
              Showing {group.films.length} records in this grouped entry.
            </Text>
            <Stack gap="xs">
              {groups.pagedGroupFilms.map((groupFilm) => (
                <StandardCard key={`group-film-${groupFilm.id}`}>
                  <Group justify="space-between" align="center" wrap="wrap">
                    <Box miw="var(--fo-space-0)">
                      <Text
                        className="baseline-textBody"
                        fw="var(--fo-font-weight-semibold)"
                      >
                        {groupFilm.title}
                        {groupFilm.release_year ? ` (${groupFilm.release_year})` : ""}
                      </Text>
                    </Box>
                    <Group gap="xs" wrap="nowrap">
                      <ActionIcon
                        variant="subtle"
                        aria-label="Decouple from grouped entry"
                        onClick={() => groups.decouple(groupFilm.id)}
                      >
                        <Text component="span" className="gicon" aria-hidden="true">
                          call_split
                        </Text>
                      </ActionIcon>
                    </Group>
                  </Group>
                </StandardCard>
              ))}
            </Stack>
            <Group justify="space-between" align="center">
              <Text className="baseline-textMeta">
                Page {groups.clampedGroupPage} of {groups.groupPageCount}
              </Text>
              <Group gap="xs">
                <Button
                  variant="default"
                  disabled={groups.clampedGroupPage <= 1}
                  onClick={groups.previousGroupPage}
                >
                  Previous
                </Button>
                <Button
                  variant="default"
                  disabled={groups.clampedGroupPage >= groups.groupPageCount}
                  onClick={groups.nextGroupPage}
                >
                  Next
                </Button>
              </Group>
            </Group>
          </>
        ) : null}
      </Stack>
    </Modal>
  );
}
