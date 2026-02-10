import {
  Box,
  Button,
  FileInput,
  Group,
  Select,
  Stack,
  Text,
  TextInput
} from "@mantine/core";
import { Accordion } from "@mantine/core";
import {
  PointerSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import { useEffect, useMemo, useState } from "react";
import type { AdminCeremonyNomineesOrchestration } from "../../../orchestration/adminCeremoniesNominees";
import { FormStatus } from "../../../ui/forms";
import { notify } from "../../../notifications";
import { StandardCard } from "../../../primitives";
import { CategoryNominationSection } from "../../../ui/admin/ceremonies/nominees/CategoryNominationSection";
import { FilmCombobox } from "../../../ui/admin/ceremonies/nominees/FilmCombobox";
import { NominationEditModal } from "../../../ui/admin/ceremonies/nominees/NominationEditModal";
import "../../../primitives/baseline.css";

export function AdminCeremoniesNomineesScreen(props: {
  o: AdminCeremonyNomineesOrchestration;
}) {
  const { o } = props;

  const {
    candidateUploading,
    candidateUploadState,
    manualLoading,
    manualState,
    categories,
    films,
    nominations,
    nominationsLoading,
    nominationsState,
    selectedCategoryId,
    setSelectedCategoryId,
    selectedCategory,
    filmInput,
    songTitle,
    setSongTitle,
    creditsLoading,
    creditsState,
    creditOptions,
    setSelectedContributorIds,
    pendingContributorId,
    setPendingContributorId,
    selectedCredits
  } = o;

  const {
    resetCandidates,
    resetManual,
    resolveFilmSelection,
    uploadCandidateFilms,
    loadNominations,
    createNomination,
    deleteNomination,
    reorderNominationsInCategory,
    linkFilmTmdb,
    linkPersonTmdb,
    addNominationContributor,
    removeNominationContributor
  } = o.actions;

  useEffect(() => {
    void loadNominations();
  }, [loadNominations]);

  const [candidateOpen, setCandidateOpen] = useState<string | null>(null);

  const hasTmdbCredits = Boolean(
    o.credits && (o.credits.cast?.length || o.credits.crew?.length)
  );
  const requiresContributor = selectedCategory?.unit_kind === "PERFORMANCE";

  const candidateLoaded = useMemo(() => {
    const msg = candidateUploadState?.message ?? "";
    return Boolean(candidateUploadState?.ok && /^Loaded candidates/i.test(msg));
  }, [candidateUploadState?.message, candidateUploadState?.ok]);

  const giconCheck = String.fromCharCode(0xe5ca);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );
  const [collapsedByCategoryId, setCollapsedByCategoryId] = useState<
    Record<number, boolean>
  >({});
  const [editingNominationId, setEditingNominationId] = useState<number | null>(null);

  useEffect(() => {
    setCollapsedByCategoryId((prev) => {
      const next = { ...prev };
      for (const c of categories) {
        if (Object.prototype.hasOwnProperty.call(next, c.id)) continue;
        const count = nominations.filter((n) => n.category_edition_id === c.id).length;
        next[c.id] = count === 0;
      }
      return next;
    });
  }, [categories, nominations]);

  return (
    <Stack className="stack-lg" mt="md" gap="lg">
      <Accordion
        value={candidateOpen}
        onChange={setCandidateOpen}
        className="wizard-accordion"
        variant="contained"
      >
        <Accordion.Item
          value="candidate-pool"
          className="wizard-accordion-item is-optional"
        >
          <Accordion.Control>
            <Group justify="space-between" wrap="nowrap" w="100%">
              <Text fw={700}>Candidate pool (optional)</Text>
              {candidateLoaded ? (
                <Text
                  component="span"
                  className="gicon wizard-inline-check"
                  aria-hidden="true"
                >
                  {giconCheck}
                </Text>
              ) : null}
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack className="stack-sm" gap="sm">
              <FileInput
                label="Candidate pool JSON"
                accept="application/json"
                onChange={(file) => o.actions.onCandidateFile(file)}
                fileInputProps={{ name: "candidate-pool-file" }}
                disabled={candidateUploading}
                placeholder="Choose file…"
              />

              <Group className="inline-actions" wrap="wrap">
                <Button
                  type="button"
                  onClick={() => void uploadCandidateFilms()}
                  disabled={candidateUploading}
                >
                  {candidateUploading ? "Loading..." : "Load candidate pool"}
                </Button>
                <Button
                  type="button"
                  variant="subtle"
                  onClick={resetCandidates}
                  disabled={candidateUploading}
                >
                  Reset
                </Button>
              </Group>

              {candidateUploadState?.ok === false ? (
                <FormStatus loading={candidateUploading} result={candidateUploadState} />
              ) : null}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <StandardCard className="wizard-panel is-primary">
        <Stack className="stack-sm" gap="sm">
          <Text fw={700}>Create nominations</Text>

          <Group className="admin-add-row" align="flex-end" wrap="wrap">
            <Box style={{ flex: "1 1 260px", minWidth: 220 }}>
              <Select
                label="Category"
                placeholder="Select…"
                searchable
                value={selectedCategoryId ? String(selectedCategoryId) : null}
                onChange={(v) => setSelectedCategoryId(v ? Number(v) : null)}
                data={categories.map((c) => ({
                  value: String(c.id),
                  label: c.family_name ?? `Category ${c.id}`
                }))}
              />
            </Box>
            <Box style={{ flex: "2 1 420px", minWidth: 260 }}>
              <FilmCombobox
                label="Film"
                value={filmInput}
                onChange={(v) => void resolveFilmSelection(v)}
                films={films}
              />
            </Box>
          </Group>

          {selectedCategory?.unit_kind === "SONG" ? (
            <TextInput
              label="Song title"
              value={songTitle}
              onChange={(e) => setSongTitle(e.currentTarget.value)}
            />
          ) : null}

          {requiresContributor ? (
            <Stack gap="sm" mt="xs">
              <Group justify="space-between" align="center" wrap="nowrap">
                <Group gap="xs" align="center" wrap="nowrap">
                  <Text fw={700}>Contributor</Text>
                  {hasTmdbCredits ? (
                    <Text
                      component="span"
                      className="gicon wizard-inline-check"
                      aria-hidden="true"
                    >
                      {giconCheck}
                    </Text>
                  ) : null}
                </Group>
              </Group>

              {creditsState?.ok === false ? (
                <FormStatus loading={creditsLoading} result={creditsState} />
              ) : null}

              <Group className="admin-add-row" align="flex-end" wrap="wrap">
                <Box style={{ flex: "1 1 360px", minWidth: 240 }}>
                  <Select
                    label="Select a person"
                    placeholder="Select…"
                    searchable
                    value={pendingContributorId || null}
                    onChange={(v) => setPendingContributorId(v ?? "")}
                    data={creditOptions.map((o) => ({
                      value: String(o.tmdb_id),
                      label: o.label
                    }))}
                    disabled={!hasTmdbCredits}
                  />
                </Box>
                <Button
                  type="button"
                  onClick={() => {
                    const id = Number(pendingContributorId);
                    if (!Number.isFinite(id) || id <= 0) return;
                    setSelectedContributorIds((prev) =>
                      prev.includes(id) ? prev : [...prev, id]
                    );
                    setPendingContributorId("");
                  }}
                  disabled={!pendingContributorId || manualLoading || !hasTmdbCredits}
                >
                  Add
                </Button>
              </Group>

              {selectedCredits.length > 0 ? (
                <Stack className="stack-sm" gap="xs">
                  {selectedCredits.map((c) => (
                    <Box key={c.tmdb_id} className="list-row">
                      <Box>
                        <Text fw={700} span>
                          {c.name}
                        </Text>
                        <Text className="muted" span>
                          {" "}
                          — {c.jobs.join(", ")}
                        </Text>
                      </Box>
                      <Group className="inline-actions" wrap="wrap">
                        <Button
                          type="button"
                          variant="subtle"
                          onClick={() =>
                            setSelectedContributorIds((prev) =>
                              prev.filter((id) => id !== c.tmdb_id)
                            )
                          }
                        >
                          Remove
                        </Button>
                      </Group>
                    </Box>
                  ))}
                </Stack>
              ) : null}
            </Stack>
          ) : null}

          <Group className="inline-actions" wrap="wrap">
            <Button
              type="button"
              onClick={() => void createNomination()}
              disabled={manualLoading}
            >
              {manualLoading ? "Saving..." : "Add nomination"}
            </Button>
            <Button
              type="button"
              variant="subtle"
              onClick={resetManual}
              disabled={manualLoading}
            >
              Reset
            </Button>
          </Group>

          {manualState?.ok === false ? (
            <FormStatus loading={manualLoading} result={manualState} />
          ) : null}
        </Stack>
      </StandardCard>

      <StandardCard className="wizard-panel">
        <Stack className="stack-sm" gap="sm">
          <Group justify="space-between" wrap="nowrap">
            <Text fw={700}>Review nominations</Text>
            <Box component="span" className="pill">
              {nominations.length}
            </Box>
          </Group>

          {nominationsState?.ok === false ? (
            <FormStatus loading={false} result={nominationsState} />
          ) : null}

          <Stack gap="md" className="nomination-groups">
            {categories.map((c) => {
              return (
                <CategoryNominationSection
                  key={c.id}
                  category={c}
                  nominations={nominations.filter((n) => n.category_edition_id === c.id)}
                  collapsed={
                    collapsedByCategoryId[c.id] ??
                    nominations.filter((n) => n.category_edition_id === c.id).length === 0
                  }
                  setCollapsed={(next) =>
                    setCollapsedByCategoryId((prev) => ({
                      ...prev,
                      [c.id]: next
                    }))
                  }
                  sensors={sensors}
                  nominationsLoading={nominationsLoading}
                  onRemoveNomination={(id) => void deleteNomination(id)}
                  onEditNomination={(id) => setEditingNominationId(id)}
                  onReorder={(categoryId, ids) =>
                    void reorderNominationsInCategory(categoryId, ids)
                  }
                />
              );
            })}
          </Stack>
        </Stack>
      </StandardCard>

      {editingNominationId ? (
        <NominationEditModal
          nomination={nominations.find((n) => n.id === editingNominationId) ?? null}
          films={films}
          people={o.peopleResults}
          peopleLoading={o.peopleLoading}
          onClose={() => setEditingNominationId(null)}
          onLinkFilm={linkFilmTmdb}
          onLinkPerson={linkPersonTmdb}
          getFilmCredits={(filmId) => o.actions.getFilmCredits(filmId)}
          onAddContributor={async (nominationId, input) => {
            const ok = await addNominationContributor(nominationId, input);
            if (ok) {
              notify({
                id: "admin.nominees.contributor.add.success",
                severity: "success",
                trigger_type: "user_action",
                scope: "local",
                durability: "ephemeral",
                requires_decision: false,
                message: "Contributor added"
              });
            }
          }}
          onRemoveContributor={async (nominationId, nominationContributorId) => {
            const ok = await removeNominationContributor(
              nominationId,
              nominationContributorId
            );
            if (ok) {
              notify({
                id: "admin.nominees.contributor.remove.success",
                severity: "success",
                trigger_type: "user_action",
                scope: "local",
                durability: "ephemeral",
                requires_decision: false,
                message: "Contributor removed"
              });
            }
          }}
        />
      ) : null}
    </Stack>
  );
}
