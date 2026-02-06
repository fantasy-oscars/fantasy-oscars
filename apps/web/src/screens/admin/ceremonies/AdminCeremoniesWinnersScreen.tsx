import {
  Accordion,
  Box,
  Button,
  Checkbox,
  Group,
  Stack,
  Text,
  Title
} from "@mantine/core";
import * as React from "react";
import type { AdminCeremonyWinnersOrchestration } from "../../../orchestration/adminCeremonies";
import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";
import { StandardCard } from "../../../primitives";
import "../../../primitives/baseline.css";

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

function materialGlyph(code: string | null | undefined) {
  const raw = (code ?? "").trim();
  if (!raw) return "";
  if (/^[0-9a-f]{4}$/i.test(raw)) return String.fromCharCode(Number.parseInt(raw, 16));
  return raw;
}

const CHECK_ICON = String.fromCharCode(0xe5ca);

export function AdminCeremoniesWinnersScreen(props: { o: AdminCeremonyWinnersOrchestration }) {
  const { o } = props;

  const {
    loading,
    loadState,
    groupedNominations,
    selectedWinner,
    toggleNomination,
    winnerByCategory,
    winnerStatus,
    savingCategory,
    draftLock,
    ceremonyStatus,
    isDirty,
    nominationLabel,
    pendingSaveAll,
    dismissPendingSaveAll,
    requestSaveAll,
    confirmPendingSaveAll,
    pendingFinalize,
    dismissPendingFinalize,
    requestFinalizeWinners,
    confirmFinalizeWinners,
    finalizeStatus
  } = o;

  const [openItems, setOpenItems] = React.useState<string[]>([]);

  React.useEffect(() => {
    setOpenItems((prev) => {
      if (prev.length > 0) return prev;
      return groupedNominations.map((g) => String(g.categoryId));
    });
  }, [groupedNominations]);

  if (loading && loadState?.message === "Loading") return <PageLoader label="Loading..." />;
  if (loadState?.ok === false) return <PageError message={loadState.message} />;

  return (
    <Stack className="stack-lg" mt="md" gap="lg">
      <StandardCard className="card nested" component="section">
        <Group className="header-with-controls" justify="space-between" align="start" wrap="wrap">
          <Box>
            <Title order={3}>Results</Title>
            <Text className="muted">Select one or more winners per category.</Text>
          </Box>
          <Group className="pill-list" wrap="wrap">
            <Box component="span" className="pill">
              {draftLock.draft_locked ? "Drafts locked" : "Drafts open"}
            </Box>
            <Box component="span" className="pill muted">
              Ceremony: {ceremonyStatus}
            </Box>
          </Group>
        </Group>
        {draftLock.draft_locked_at ? (
          <Text className="muted">
            Locked at {new Date(draftLock.draft_locked_at).toLocaleString()}
          </Text>
        ) : null}
      </StandardCard>

      {groupedNominations.length === 0 ? (
        <PageError message="No nominees loaded. Add nominees for this ceremony first." />
      ) : (
        <Box>
          <Box className="results-sticky-header">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Text fw={700}>Winners</Text>
              <Group gap="xs" wrap="nowrap">
                <Button
                  type="button"
                  onClick={requestSaveAll}
                  disabled={!isDirty || savingCategory !== null || ceremonyStatus === "COMPLETE"}
                >
                  Save
                </Button>
              </Group>
            </Group>
          </Box>

          <Accordion
            multiple
            value={openItems}
            onChange={setOpenItems}
            className="results-accordion"
            variant="contained"
          >
            {groupedNominations.map(({ categoryId, category, nominations }) => {
              const label = category?.family_name ?? `Category ${categoryId}`;
              const iconCode = category?.family_icon_code ?? null;
              const isInverted = category?.family_icon_variant === "inverted";
              const hasWinner = (winnerByCategory[categoryId] ?? []).length > 0;

              return (
                <Accordion.Item key={categoryId} value={String(categoryId)}>
                  <Accordion.Control>
                    <Group justify="space-between" align="center" wrap="nowrap" w="100%">
                      <Group gap="sm" align="center" wrap="nowrap" style={{ minWidth: 0 }}>
                        <Text
                          component="span"
                          className={["mi-icon", isInverted ? "mi-icon-inverted" : ""]
                            .filter(Boolean)
                            .join(" ")}
                          aria-hidden="true"
                        >
                          {materialGlyph(iconCode || "trophy")}
                        </Text>
                        <Text className="nomination-group-title" component="h3" lineClamp={1}>
                          {label}{" "}
                          <Text component="span" className="nomination-group-count">
                            ({nominations.length})
                          </Text>
                        </Text>
                        <Box className="results-winner-checkSlot" aria-hidden="true">
                          {hasWinner ? (
                            <Box className="results-winner-check">
                              <Text component="span" className="gicon" aria-hidden="true">
                                {CHECK_ICON}
                              </Text>
                            </Box>
                          ) : null}
                        </Box>
                      </Group>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    {nominations.length === 0 ? (
                      <Text className="muted" size="sm">
                        No nominations yet.
                      </Text>
                    ) : (
                      <Stack gap={0} className="nomination-list">
                        {nominations.map((nom: WinnersNomination) => (
                          <Group
                            key={nom.id}
                            className={["nomination-row", "nomination-row-compact"].join(" ")}
                            justify="space-between"
                            align="center"
                            wrap="nowrap"
                          >
                            <Group gap="sm" align="center" wrap="nowrap" style={{ minWidth: 0 }}>
                              <Checkbox
                                aria-label={`Select winner: ${nominationLabel(nom)}`}
                                checked={(selectedWinner[categoryId] ?? []).includes(nom.id)}
                                onChange={(e) =>
                                  toggleNomination(categoryId, nom.id, e.currentTarget.checked)
                                }
                              />
                              <Text fw={700} lineClamp={1} style={{ minWidth: 0 }}>
                                {nominationLabel(nom)}
                              </Text>
                            </Group>
                          </Group>
                        ))}
                      </Stack>
                    )}

                    <FormStatus
                      loading={savingCategory === categoryId}
                      result={winnerStatus[categoryId] ?? null}
                    />
                  </Accordion.Panel>
                </Accordion.Item>
              );
            })}
          </Accordion>

          <Box mt="lg">
            <Group justify="space-between" align="center" wrap="wrap">
              <Button
                type="button"
                variant="subtle"
                onClick={requestFinalizeWinners}
                disabled={ceremonyStatus !== "LOCKED" || savingCategory !== null}
              >
                Finalize winners
              </Button>
              {finalizeStatus?.ok === false ? (
                <Text className="muted" size="sm">
                  {finalizeStatus.message}
                </Text>
              ) : null}
            </Group>
          </Box>
        </Box>
      )}

      {pendingSaveAll ? (
        <Box className="modal-backdrop" role="presentation">
          <StandardCard className="modal" role="dialog" aria-modal="true" aria-label="Confirm save">
            <Title order={4}>Confirm</Title>
            <Text className="muted">{pendingSaveAll.message}</Text>
            <Group className="inline-actions" wrap="wrap">
              <Button type="button" onClick={dismissPendingSaveAll}>
                Cancel
              </Button>
              <Button type="button" variant="subtle" onClick={confirmPendingSaveAll}>
                Save winners
              </Button>
            </Group>
          </StandardCard>
        </Box>
      ) : null}

      {pendingFinalize ? (
        <Box className="modal-backdrop" role="presentation">
          <StandardCard
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Finalize winners"
          >
            <Title order={4}>Finalize winners</Title>
            <Text className="muted">{pendingFinalize.message}</Text>
            <Group className="inline-actions" wrap="wrap">
              <Button type="button" onClick={dismissPendingFinalize}>
                Cancel
              </Button>
              <Button type="button" variant="subtle" onClick={confirmFinalizeWinners}>
                Finalize
              </Button>
            </Group>
          </StandardCard>
        </Box>
      ) : null}
    </Stack>
  );
}
