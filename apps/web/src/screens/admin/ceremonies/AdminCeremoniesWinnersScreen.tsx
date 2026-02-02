import { Box, Button, Card, Checkbox, Group, Stack, Text, Title } from "@mantine/core";
import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";
import type { ApiResult } from "../../../lib/types";

type WinnersNomination = {
  id: number;
  category_edition_id: number;
  film_title?: string | null;
  song_title?: string | null;
  performer_name?: string | null;
  contributors?: Array<{
    person_id: number;
    full_name: string;
    role_label: string | null;
    sort_order: number;
  }>;
};

export function AdminCeremoniesWinnersScreen(props: {
  loading: boolean;
  loadState: ApiResult | null;
  groupedNominations: Array<{
    categoryId: number;
    nominations: WinnersNomination[];
  }>;
  selectedWinner: Record<number, number[]>;
  toggleNomination: (categoryId: number, nominationId: number, checked: boolean) => void;
  resetCategory: (categoryId: number) => void;
  winnerByCategory: Record<number, number[]>;
  winnerStatus: Record<number, ApiResult | null>;
  savingCategory: number | null;
  draftLock: { draft_locked: boolean; draft_locked_at: string | null };
  nominationLabel: (n: WinnersNomination) => string;
  pendingWinner: { categoryId: number; nominationIds: number[]; message: string } | null;
  dismissPendingWinner: () => void;
  requestSaveWinners: (categoryId: number) => void;
  confirmPendingWinner: () => void;
}) {
  const {
    loading,
    loadState,
    groupedNominations,
    selectedWinner,
    toggleNomination,
    resetCategory,
    winnerByCategory,
    winnerStatus,
    savingCategory,
    draftLock,
    nominationLabel,
    pendingWinner,
    dismissPendingWinner,
    requestSaveWinners,
    confirmPendingWinner
  } = props;

  if (loading && loadState?.message === "Loading")
    return <PageLoader label="Loading winners..." />;
  if (loadState?.ok === false) return <PageError message={loadState.message} />;

  return (
    <Stack className="stack-lg" mt="md" gap="lg">
      <Card className="card nested" component="section">
        <Group
          className="header-with-controls"
          justify="space-between"
          align="start"
          wrap="wrap"
        >
          <Box>
            <Title order={3}>Winners</Title>
            <Text className="muted">
              Enter or edit winners per category for this ceremony.
            </Text>
          </Box>
          <Group className="pill-list" wrap="wrap">
            <Box component="span" className="pill">
              {draftLock.draft_locked ? "Drafts locked" : "Drafts open"}
            </Box>
          </Group>
        </Group>
        {draftLock.draft_locked_at ? (
          <Text className="muted">
            Locked at {new Date(draftLock.draft_locked_at).toLocaleString()}
          </Text>
        ) : null}
        <Box className="status status-warning">
          First winner entry locks drafts. Changing winners keeps drafts locked.
        </Box>
      </Card>

      {groupedNominations.length === 0 ? (
        <PageError message="No nominees loaded. Add nominees for this ceremony first." />
      ) : (
        <Stack className="stack-lg" gap="lg">
          {groupedNominations.map(({ categoryId, nominations }) => (
            <Card key={categoryId} className="card nested" component="section">
              <Group
                className="header-with-controls"
                justify="space-between"
                align="start"
                wrap="wrap"
              >
                <Box>
                  <Title order={4}>Category {categoryId}</Title>
                  <Text className="muted">Pick the winner</Text>
                </Box>
                <Group className="pill-list" wrap="wrap">
                  {(winnerByCategory[categoryId] ?? []).length > 0 ? (
                    <Box component="span" className="pill">
                      Winner set
                    </Box>
                  ) : (
                    <Box component="span" className="pill muted">
                      Unset
                    </Box>
                  )}
                  {!draftLock.draft_locked &&
                  (winnerByCategory[categoryId] ?? []).length === 0 ? (
                    <Box component="span" className="pill">
                      Will lock drafts
                    </Box>
                  ) : null}
                </Group>
              </Group>
              <Stack className="stack-sm" gap="sm">
                {nominations.map((nom) => (
                  <Group
                    key={nom.id}
                    className="list-row"
                    wrap="nowrap"
                    align="flex-start"
                  >
                    <Checkbox
                      aria-label={`Nomination #${nom.id}`}
                      checked={(selectedWinner[categoryId] ?? []).includes(nom.id)}
                      onChange={(e) =>
                        toggleNomination(categoryId, nom.id, e.currentTarget.checked)
                      }
                    />
                    <Box>
                      <Text className="eyebrow" size="xs">
                        Nomination #{nom.id}
                      </Text>
                      <Text fw={700}>{nominationLabel(nom)}</Text>
                    </Box>
                  </Group>
                ))}
                <Group className="inline-actions" wrap="wrap">
                  <Button
                    type="button"
                    onClick={() => requestSaveWinners(categoryId)}
                    disabled={savingCategory === categoryId}
                  >
                    {savingCategory === categoryId ? "Saving..." : "Save winners"}
                  </Button>
                  <Button
                    type="button"
                    variant="subtle"
                    onClick={() => resetCategory(categoryId)}
                  >
                    Reset
                  </Button>
                </Group>
                <FormStatus
                  loading={savingCategory === categoryId}
                  result={winnerStatus[categoryId] ?? null}
                />
              </Stack>
            </Card>
          ))}
        </Stack>
      )}

      {pendingWinner ? (
        <Box className="modal-backdrop" role="presentation">
          <Card
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm winner"
          >
            <Title order={4}>Confirm winner</Title>
            <Text className="muted">{pendingWinner.message}</Text>
            <Group className="inline-actions" wrap="wrap">
              <Button type="button" onClick={dismissPendingWinner}>
                Cancel
              </Button>
              <Button type="button" variant="subtle" onClick={confirmPendingWinner}>
                Yes, save winners
              </Button>
            </Group>
          </Card>
        </Box>
      ) : null}
    </Stack>
  );
}
