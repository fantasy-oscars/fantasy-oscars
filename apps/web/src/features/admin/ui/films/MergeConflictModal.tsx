import { Button, Group, Modal, Select, Stack, Text } from "@ui";
import type { AdminFilmRow } from "@/orchestration/admin/filmsIndex/orchestration";
import "@/primitives/baseline.css";

export type MergeConflictController = {
  mergeConflict: { linkedFilms: AdminFilmRow[]; keepLinkedId: string } | null;
  resolvingConflict: boolean;
  closeConflict: () => void;
  cancelConflict: () => void;
  setKeepLinkedId: (value: string) => void;
  resolveConflict: () => void;
};

export function MergeConflictModal(props: { merge: MergeConflictController }) {
  const { merge } = props;
  const conflict = merge.mergeConflict;
  return (
    <Modal
      opened={Boolean(conflict)}
      onClose={merge.closeConflict}
      title="Resolve TMDB link conflict"
      centered
      size="md"
      overlayProps={{ opacity: 0.35, blur: 2 }}
    >
      <Stack gap="sm">
        <Text className="baseline-textBody">
          Multiple selected films are linked to TMDB. Choose one film to remain linked,
          and the others will be unlinked before merge.
        </Text>
        <Select
          label="Keep linked"
          data={(conflict?.linkedFilms ?? []).map((film) => ({
            value: String(film.id),
            label: `${film.title}${film.release_year ? ` (${film.release_year})` : ""}`
          }))}
          value={conflict?.keepLinkedId ?? null}
          onChange={(value) => {
            if (!value) return;
            merge.setKeepLinkedId(value);
          }}
        />
        <Group justify="flex-end">
          <Button
            variant="subtle"
            disabled={merge.resolvingConflict}
            onClick={merge.cancelConflict}
          >
            Cancel
          </Button>
          <Button
            loading={merge.resolvingConflict}
            disabled={!conflict?.keepLinkedId}
            onClick={merge.resolveConflict}
          >
            Unlink others and merge
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
