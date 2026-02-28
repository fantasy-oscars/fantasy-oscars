import { Box, Group, Stack, Text } from "@ui";
import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useEffect, useMemo, useState } from "react";
import type { AdminCeremonyNomineesOrchestration } from "@/orchestration/adminCeremoniesNominees";
import { FormStatus } from "@/shared/forms";
import { notify } from "@/notifications";
import { StandardCard } from "@/primitives";
import { CandidatePoolAccordion } from "@/features/admin/ui/ceremonies/nominees/CandidatePoolAccordion";
import { CreateNominationPanel } from "@/features/admin/ui/ceremonies/nominees/CreateNominationPanel";
import { CategoryNominationSection } from "./nominees/CategoryNominationSection";
import { NominationEditModal } from "./nominees/NominationEditModal";
import "@/primitives/baseline.css";

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

  const addPendingContributor = () => {
    const id = Number(pendingContributorId);
    if (!Number.isFinite(id) || id <= 0) return;
    setSelectedContributorIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setPendingContributorId("");
  };

  const removeSelectedContributor = (tmdbId: number) => {
    setSelectedContributorIds((prev) => prev.filter((id) => id !== tmdbId));
  };

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
      <CandidatePoolAccordion
        open={candidateOpen}
        setOpen={setCandidateOpen}
        candidateLoaded={candidateLoaded}
        candidateUploading={candidateUploading}
        candidateUploadState={candidateUploadState}
        onPickFile={(file) => o.actions.onCandidateFile(file)}
        onUpload={() => void uploadCandidateFilms()}
        onReset={resetCandidates}
      />

      <CreateNominationPanel
        categories={categories.map((c) => ({
          id: c.id,
          label: c.family_name ?? `Category ${c.id}`
        }))}
        selectedCategoryId={selectedCategoryId}
        setSelectedCategoryId={setSelectedCategoryId}
        films={films}
        filmInput={filmInput}
        onFilmChange={(v) => void resolveFilmSelection(v)}
        onFilmPick={(film) => void o.actions.selectFilmFromPicker(film)}
        unitKind={selectedCategory?.unit_kind ?? null}
        songTitle={songTitle}
        setSongTitle={setSongTitle}
        requiresContributor={Boolean(requiresContributor)}
        hasTmdbCredits={hasTmdbCredits}
        creditsLoading={creditsLoading}
        creditsState={creditsState}
        creditOptions={creditOptions}
        pendingContributorId={pendingContributorId}
        setPendingContributorId={setPendingContributorId}
        onAddPendingContributor={addPendingContributor}
        selectedCredits={selectedCredits}
        onRemoveSelectedContributor={removeSelectedContributor}
        manualLoading={manualLoading}
        manualState={manualState}
        onCreateNomination={() => void createNomination()}
        onReset={resetManual}
        checkIconChar={giconCheck}
      />

      <StandardCard className="wizard-panel">
        <Stack className="stack-sm" gap="sm">
          <Group justify="space-between" wrap="nowrap">
            <Text fw="var(--fo-font-weight-bold)">Review nominations</Text>
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
          setPeopleQuery={o.setPeopleQuery}
          people={o.peopleResults}
          peopleLoading={o.peopleLoading}
          onClose={() => {
            o.setPeopleQuery("");
            setEditingNominationId(null);
          }}
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
