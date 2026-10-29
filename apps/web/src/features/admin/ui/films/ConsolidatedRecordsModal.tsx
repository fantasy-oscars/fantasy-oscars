import { ActionIcon, Box, Button, Group, Modal, Stack, Text } from "@ui";
import { StandardCard } from "@/primitives/cards/StandardCard";
import type {
  AdminFilmRow,
  ConsolidatedFilmRow
} from "@/orchestration/admin/filmsIndex/orchestration";
import "@/primitives/baseline.css";

export type ConsolidatedFilmsController = {
  modalFilm: AdminFilmRow | null;
  loading: boolean;
  rows: ConsolidatedFilmRow[];
  page: number;
  totalPages: number;
  total: number;
  decouplingFilmId: number | null;
  close: () => void;
  decouple: (filmId: number) => void;
  previousPage: () => void;
  nextPage: () => void;
};

export function ConsolidatedRecordsModal(props: {
  consolidated: ConsolidatedFilmsController;
}) {
  const { consolidated } = props;
  const film = consolidated.modalFilm;
  return (
    <Modal
      opened={Boolean(film)}
      onClose={consolidated.close}
      title="Manage consolidated records"
      centered
      size="lg"
      overlayProps={{ opacity: 0.35, blur: 2 }}
    >
      <Stack gap="sm">
        <Text className="baseline-textMeta">
          {film
            ? `Consolidated into ${film.title}${film.release_year ? ` (${film.release_year})` : ""}`
            : ""}
        </Text>
        {consolidated.loading ? (
          <Text className="baseline-textMeta">Loading…</Text>
        ) : consolidated.rows.length === 0 ? (
          <Text className="baseline-textMeta">No consolidated child records.</Text>
        ) : (
          <Stack gap="xs">
            {consolidated.rows.map((groupFilm) => (
              <StandardCard key={`consolidated-child-${groupFilm.id}`}>
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
                      aria-label="Decouple consolidated film"
                      disabled={consolidated.decouplingFilmId === groupFilm.id}
                      onClick={() => consolidated.decouple(groupFilm.id)}
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
        )}
        <Group justify="space-between" align="center">
          <Text className="baseline-textMeta">
            Page {consolidated.page} of {consolidated.totalPages} ({consolidated.total}{" "}
            records)
          </Text>
          <Group gap="xs">
            <Button
              variant="default"
              disabled={consolidated.page <= 1 || consolidated.loading}
              onClick={consolidated.previousPage}
            >
              Previous
            </Button>
            <Button
              variant="default"
              disabled={
                consolidated.page >= consolidated.totalPages || consolidated.loading
              }
              onClick={consolidated.nextPage}
            >
              Next
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
