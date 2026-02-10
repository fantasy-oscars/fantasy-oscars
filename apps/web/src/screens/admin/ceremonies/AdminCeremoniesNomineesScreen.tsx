import { materialGlyph } from "../../../decisions/admin/materialGlyph";
import {
  nominationPrimaryLabel,
  nominationSecondaryLabel
} from "../../../decisions/admin/nominationLabels";
import {
  ActionIcon,
  Box,
  Button,
  FileInput,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput
} from "@mantine/core";
import { Accordion } from "@mantine/core";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove
} from "@dnd-kit/sortable";
import { useEffect, useMemo, useState } from "react";
import type { AdminCeremonyNomineesOrchestration } from "../../../orchestration/adminCeremoniesNominees";
import { FormStatus } from "../../../ui/forms";
import { notify } from "../../../notifications";
import { StandardCard } from "../../../primitives";
import { normalizeForSearch } from "@fantasy-oscars/shared";
import { SortableNominationRow } from "../../../ui/admin/ceremonies/nominees/SortableNominationRow";
import { FilmCombobox } from "../../../ui/admin/ceremonies/nominees/FilmCombobox";
import {
  ContributorCombobox,
  type ContributorOption
} from "../../../ui/admin/ceremonies/nominees/ContributorCombobox";
import "../../../primitives/baseline.css";

function CategoryNominationSection(props: {
  category: {
    id: number;
    unit_kind: "FILM" | "SONG" | "PERFORMANCE";
    family_name?: string;
    family_icon_code?: string | null;
    family_icon_variant?: "default" | "inverted" | null;
  };
  nominations: Array<{
    id: number;
    category_edition_id: number;
    display_film_id?: number | null;
    display_film_tmdb_id?: number | null;
    film_title?: string | null;
    song_title?: string | null;
    performer_name?: string | null;
    performer_character?: string | null;
    contributors?: Array<{ full_name: string; sort_order: number }>;
  }>;
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
  sensors: ReturnType<typeof useSensors>;
  nominationsLoading: boolean;
  onRemoveNomination: (id: number) => void;
  onEditNomination: (id: number) => void;
  onReorder: (categoryId: number, orderedIds: number[]) => void;
}) {
  const {
    category: c,
    nominations,
    collapsed,
    setCollapsed,
    sensors,
    nominationsLoading,
    onRemoveNomination,
    onEditNomination,
    onReorder
  } = props;

  const label = c.family_name ?? `Category ${c.id}`;
  const items = nominations;
  const nominationIds = useMemo(() => items.map((n) => n.id), [items]);
  const isInverted = c.family_icon_variant === "inverted";
  const iconCode = c.family_icon_code ?? null;

  const [overId, setOverId] = useState<number | null>(null);

  const onDragOver = (evt: DragOverEvent) => {
    const nextOver = typeof evt.over?.id === "number" ? (evt.over.id as number) : null;
    setOverId(nextOver);
  };

  const onDragEnd = (evt: DragEndEvent) => {
    setOverId(null);
    const activeId = evt.active?.id;
    const over = evt.over?.id;
    if (typeof activeId !== "number" || typeof over !== "number") return;
    if (activeId === over) return;
    const oldIndex = nominationIds.indexOf(activeId);
    const newIndex = nominationIds.indexOf(over);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(nominationIds, oldIndex, newIndex);
    onReorder(c.id, next);
  };

  return (
    <Box className="nomination-group">
      <Box
        className="nomination-group-header"
        role="button"
        tabIndex={0}
        onClick={() => setCollapsed(!collapsed)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          setCollapsed(!collapsed);
        }}
      >
        <Group justify="space-between" align="center" wrap="nowrap">
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
                ({items.length})
              </Text>
            </Text>
          </Group>
          <Text
            component="span"
            className="gicon nomination-group-chevron"
            aria-hidden="true"
          >
            {collapsed ? "chevron_right" : "expand_more"}
          </Text>
        </Group>
      </Box>

      {collapsed ? null : items.length === 0 ? (
        <Text className="muted" size="sm">
          No nominations yet.
        </Text>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={nominationIds} strategy={verticalListSortingStrategy}>
            <Stack gap={0} className="nomination-list" role="list" aria-label={label}>
              {items.map((n) => (
                <SortableNominationRow
                  key={n.id}
                  id={n.id}
                  primary={
                    <Group gap={6} wrap="nowrap">
                      <Text component="span" inherit>
                        {nominationPrimaryLabel({
                          unit_kind: c.unit_kind,
                          film_title: n.film_title ?? null,
                          song_title: n.song_title ?? null,
                          performer_name: n.performer_name ?? null,
                          contributors: n.contributors?.map((x) => ({
                            full_name: x.full_name,
                            sort_order: x.sort_order
                          })),
                          fallbackId: n.id
                        })}
                      </Text>
                      {n.display_film_id &&
                      !n.display_film_tmdb_id &&
                      (c.unit_kind === "FILM" ||
                        c.unit_kind === "PERFORMANCE" ||
                        c.unit_kind === "SONG") ? (
                        <Text
                          component="span"
                          className="gicon muted"
                          aria-label="Film not linked to TMDB"
                        >
                          link_off
                        </Text>
                      ) : null}
                    </Group>
                  }
                  secondary={nominationSecondaryLabel({
                    unit_kind: c.unit_kind,
                    film_title: n.film_title ?? null
                  })}
                  onRemove={() => onRemoveNomination(n.id)}
                  onEdit={() => onEditNomination(n.id)}
                  removing={nominationsLoading}
                  isDropTarget={overId === n.id}
                />
              ))}
            </Stack>
          </SortableContext>
        </DndContext>
      )}
    </Box>
  );
}

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

function NominationEditModal(props: {
  nomination: null | {
    id: number;
    display_film_id?: number | null;
    film_title?: string | null;
    contributors?: Array<{
      nomination_contributor_id?: number;
      person_id: number;
      full_name: string;
      tmdb_id?: number | null;
      role_label: string | null;
      sort_order: number;
    }>;
  };
  films: Array<{
    id: number;
    title: string;
    tmdb_id?: number | null;
    release_year?: number | null;
  }>;
  people: Array<{ id: number; full_name: string; tmdb_id: number | null }>;
  peopleLoading: boolean;
  onClose: () => void;
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
  onLinkPerson: (
    personId: number,
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
  onAddContributor: (
    nominationId: number,
    input: { person_id?: number; name?: string; tmdb_id?: number }
  ) => Promise<void>;
  onRemoveContributor: (
    nominationId: number,
    nominationContributorId: number
  ) => Promise<void>;
  getFilmCredits: (filmId: number) => Promise<unknown | null>;
}) {
  const {
    nomination,
    films,
    people,
    peopleLoading,
    onClose,
    onLinkFilm,
    onLinkPerson,
    onAddContributor,
    onRemoveContributor,
    getFilmCredits
  } = props;

  type CreditPerson = {
    tmdb_id?: number;
    id?: number;
    name?: string;
    character?: string | null;
    job?: string | null;
    department?: string | null;
    profile_path?: string | null;
    credit_id?: string | null;
  };
  type FilmCredits = { cast?: CreditPerson[]; crew?: CreditPerson[] };

  const [filmLinkOpen, setFilmLinkOpen] = useState(false);
  const [filmTmdbId, setFilmTmdbId] = useState("");

  const [personLinkOpenId, setPersonLinkOpenId] = useState<number | null>(null);
  const [personTmdbId, setPersonTmdbId] = useState("");

  const [pendingContributorInput, setPendingContributorInput] = useState("");

  const [filmCredits, setFilmCredits] = useState<FilmCredits | null>(null);
  const [filmLinkConflict, setFilmLinkConflict] = useState<{
    tmdbId: number;
    linkedFilmId: number;
    linkedFilmTitle: string | null;
  } | null>(null);

  const filmId = nomination?.display_film_id ?? null;
  const film = filmId ? (films.find((f) => f.id === filmId) ?? null) : null;
  const filmLinked = Boolean(film?.tmdb_id);

  const contributorRows = useMemo(() => {
    return (nomination?.contributors ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [nomination?.contributors]);

  const creditByPersonId = useMemo(() => {
    const map = new Map<
      number,
      {
        name: string;
        crewJobs: string[];
        crewJobsSet: Set<string>;
        characters: string[];
        characterSet: Set<string>;
        isCast: boolean;
      }
    >();
    const credits = filmCredits;
    if (!credits) return map;

    for (const c of credits.crew ?? []) {
      const tmdbId = Number(c.tmdb_id ?? c.id);
      const name = typeof c.name === "string" ? String(c.name) : "";
      if (!tmdbId || !name) continue;
      const job =
        typeof c.job === "string" && String(c.job).trim()
          ? String(c.job).trim()
          : typeof c.department === "string" && String(c.department).trim()
            ? String(c.department).trim()
            : "";
      if (!job) continue;
      const existing = map.get(tmdbId) ?? {
        name,
        crewJobs: [],
        crewJobsSet: new Set<string>(),
        characters: [],
        characterSet: new Set<string>(),
        isCast: false
      };
      if (!existing.crewJobsSet.has(job)) {
        existing.crewJobsSet.add(job);
        existing.crewJobs.push(job);
      }
      map.set(tmdbId, existing);
    }

    for (const c of credits.cast ?? []) {
      const tmdbId = Number(c.tmdb_id ?? c.id);
      const name = typeof c.name === "string" ? String(c.name) : "";
      if (!tmdbId || !name) continue;
      const character =
        typeof c.character === "string" && String(c.character).trim()
          ? String(c.character).trim()
          : "";
      const existing = map.get(tmdbId) ?? {
        name,
        crewJobs: [],
        crewJobsSet: new Set<string>(),
        characters: [],
        characterSet: new Set<string>(),
        isCast: false
      };
      existing.isCast = true;
      if (character && !existing.characterSet.has(character)) {
        existing.characterSet.add(character);
        existing.characters.push(character);
      }
      map.set(tmdbId, existing);
    }

    return map;
  }, [filmCredits]);

  const creditOptions = useMemo(() => {
    const opts: Array<{ tmdb_id: number; name: string; label: string; search: string }> =
      [];
    for (const [tmdbId, info] of creditByPersonId.entries()) {
      const jobs: string[] = [];
      for (const j of info.crewJobs) jobs.push(j);
      if (info.isCast) {
        const role = info.characters.length ? ` (as ${info.characters.join(" / ")})` : "";
        jobs.push(`Cast${role}`);
      }
      const label = `${info.name} -- ${jobs.join(", ")}`;
      opts.push({
        tmdb_id: tmdbId,
        name: info.name,
        label,
        search: normalizeForSearch(`${info.name} ${jobs.join(" ")}`)
      });
    }
    return opts.sort((a, b) => a.name.localeCompare(b.name));
  }, [creditByPersonId]);

  const contributorComboboxOptions = useMemo<ContributorOption[]>(() => {
    const q = normalizeForSearch(pendingContributorInput);
    const fromCredits =
      creditOptions.length > 0
        ? creditOptions
            .filter((c) => (q ? c.search.includes(q) : true))
            .slice(0, 50)
            .map((c) => ({
              kind: "tmdb" as const,
              value: `tmdb:${c.tmdb_id}`,
              label: c.label,
              name: c.name,
              tmdb_id: c.tmdb_id
            }))
        : [];
    const fromPeople =
      creditOptions.length === 0
        ? people
            .filter((p) => (q ? normalizeForSearch(p.full_name).includes(q) : true))
            .slice(0, 50)
            .map((p) => ({
              kind: "person" as const,
              value: `person:${p.id}`,
              label: p.full_name,
              name: p.full_name,
              person_id: p.id
            }))
        : [];
    const base = [...fromCredits, ...fromPeople];
    const exact = q ? base.some((o) => normalizeForSearch(o.name) === q) : true;
    const create =
      q && !exact
        ? [
            {
              kind: "create" as const,
              value: `create:${pendingContributorInput.trim()}`,
              label: `Create person: ${pendingContributorInput.trim()}`,
              name: pendingContributorInput.trim()
            }
          ]
        : [];
    return [...create, ...base];
  }, [creditOptions, pendingContributorInput, people]);

  useEffect(() => {
    // When the film becomes TMDB-linked, load credits so the contributor dropdown can use cast/crew.
    if (!filmId) {
      setFilmCredits(null);
      return;
    }
    void (async () => {
      const creditsUnknown = await getFilmCredits(filmId);
      if (!creditsUnknown) {
        setFilmCredits(null);
        return;
      }
      const creditsObj = creditsUnknown as { cast?: unknown; crew?: unknown };
      const cast = Array.isArray(creditsObj.cast)
        ? (creditsObj.cast as CreditPerson[])
        : undefined;
      const crew = Array.isArray(creditsObj.crew)
        ? (creditsObj.crew as CreditPerson[])
        : undefined;
      setFilmCredits({ cast, crew });
    })();
  }, [filmId, filmLinked, getFilmCredits]);

  if (!nomination) return null;

  return (
    <Modal
      opened
      onClose={onClose}
      title="Edit nomination"
      centered
      size="lg"
      overlayProps={{ opacity: 0.35, blur: 2 }}
    >
      <Stack gap="sm">
        <Box>
          <Group justify="space-between" align="center" wrap="nowrap">
            <Text fw={700}>Film</Text>
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
            {film ? film.title : (nomination.film_title ?? "—")}
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
                    const nextTmdbId = filmTmdbId.trim()
                      ? Number(filmTmdbId.trim())
                      : null;
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
        </Box>

        <Modal
          opened={Boolean(filmId) && Boolean(filmLinkConflict)}
          onClose={() => setFilmLinkConflict(null)}
          title="TMDB id already linked"
          centered
          size="md"
          overlayProps={{ opacity: 0.45, blur: 2 }}
        >
          <Stack gap="sm">
            <Text size="sm">
              {filmLinkConflict?.linkedFilmTitle
                ? `That TMDB id is already linked to “${filmLinkConflict.linkedFilmTitle}”.`
                : "That TMDB id is already linked to another film."}
            </Text>
            <Text size="sm" className="muted">
              If it was linked to the wrong film, you can remove it there and link it
              here.
            </Text>
            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setFilmLinkConflict(null)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  void (async () => {
                    if (!filmId || !filmLinkConflict) return;
                    const { tmdbId, linkedFilmId } = filmLinkConflict;
                    const unlink = await onLinkFilm(linkedFilmId, null);
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
                    const link = await onLinkFilm(filmId, tmdbId);
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
                    setFilmLinkConflict(null);
                    setFilmLinkOpen(false);
                    setFilmTmdbId("");
                  })()
                }
              >
                Remove &amp; link
              </Button>
            </Group>
          </Stack>
        </Modal>

        <Box>
          <Text fw={700}>People</Text>
          <Text className="muted" size="xs">
            Changes here apply only to this nomination.
          </Text>

          {contributorRows.length === 0 ? (
            <Text className="muted" size="sm" mt="xs">
              No contributors yet.
            </Text>
          ) : (
            <Stack gap={4} mt="xs">
              {contributorRows.map((c) => (
                <Group
                  key={`${c.person_id}:${c.nomination_contributor_id ?? "?"}`}
                  justify="space-between"
                  wrap="nowrap"
                >
                  <Box style={{ minWidth: 0 }}>
                    <Group gap={6} wrap="nowrap">
                      <Text fw={700} size="sm" lineClamp={1}>
                        {c.full_name}
                      </Text>
                      {!c.tmdb_id ? (
                        <Text
                          component="span"
                          className="gicon muted"
                          aria-label="Contributor not linked to TMDB"
                        >
                          link_off
                        </Text>
                      ) : null}
                      {c.role_label ? (
                        <Text className="muted" size="xs" lineClamp={1}>
                          ({c.role_label})
                        </Text>
                      ) : null}
                    </Group>
                  </Box>

                  <Group gap="xs" wrap="nowrap">
                    <ActionIcon
                      variant="subtle"
                      aria-label="Link contributor to TMDB"
                      onClick={() => {
                        setPersonLinkOpenId((prev) =>
                          prev === c.person_id ? null : c.person_id
                        );
                        setPersonTmdbId(c.tmdb_id ? String(c.tmdb_id) : "");
                      }}
                    >
                      <Text component="span" className="gicon" aria-hidden="true">
                        add_link
                      </Text>
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      aria-label="Remove contributor"
                      onClick={() => {
                        if (!c.nomination_contributor_id) return;
                        void onRemoveContributor(
                          nomination.id,
                          c.nomination_contributor_id
                        );
                      }}
                    >
                      <Text component="span" className="gicon" aria-hidden="true">
                        {String.fromCharCode(0xe872)}
                      </Text>
                    </ActionIcon>
                  </Group>
                </Group>
              ))}
            </Stack>
          )}

          {personLinkOpenId ? (
            <Group mt="xs" align="flex-end" wrap="wrap">
              <TextInput
                label="TMDB person id"
                value={personTmdbId}
                onChange={(e) => setPersonTmdbId(e.currentTarget.value)}
                placeholder="6384"
              />
              {(nomination.contributors ?? []).some(
                (c) => c.person_id === personLinkOpenId && Boolean(c.tmdb_id)
              ) ? (
                <ActionIcon
                  variant="subtle"
                  aria-label="Remove TMDB link"
                  onClick={() =>
                    void (async () => {
                      const r = await onLinkPerson(personLinkOpenId, null);
                      if (r.ok) {
                        notify({
                          id: "admin.nominees.person.unlink.success",
                          severity: "success",
                          trigger_type: "user_action",
                          scope: "local",
                          durability: "ephemeral",
                          requires_decision: false,
                          title: "Contributor unlinked",
                          message: "Removed TMDB link."
                        });
                        setPersonLinkOpenId(null);
                        setPersonTmdbId("");
                      } else {
                        notify({
                          id: "admin.nominees.person.unlink.error",
                          severity: "error",
                          trigger_type: "user_action",
                          scope: "local",
                          durability: "ephemeral",
                          requires_decision: false,
                          title: "Could not unlink contributor",
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
                    const nextTmdbId = personTmdbId.trim()
                      ? Number(personTmdbId.trim())
                      : null;
                    const r = await onLinkPerson(personLinkOpenId, nextTmdbId);
                    if (r.ok) {
                      notify({
                        id: "admin.nominees.person.link.success",
                        severity: "success",
                        trigger_type: "user_action",
                        scope: "local",
                        durability: "ephemeral",
                        requires_decision: false,
                        title: nextTmdbId ? "Contributor linked" : "Contributor unlinked",
                        message: nextTmdbId
                          ? r.hydrated
                            ? "Hydrated details from TMDB."
                            : "Linked."
                          : "Unlinked."
                      });
                      setPersonLinkOpenId(null);
                      setPersonTmdbId("");
                      return;
                    }
                    notify({
                      id: "admin.nominees.person.link.error",
                      severity: "error",
                      trigger_type: "user_action",
                      scope: "local",
                      durability: "ephemeral",
                      requires_decision: false,
                      title: nextTmdbId
                        ? "Could not link contributor"
                        : "Could not unlink contributor",
                      message: r.error
                    });
                  })()
                }
              >
                Save
              </Button>
            </Group>
          ) : null}

          <Group mt="sm" align="flex-end" wrap="wrap">
            <Box style={{ flex: "1 1 360px", minWidth: 240 }}>
              <ContributorCombobox
                label="Add contributor"
                value={pendingContributorInput}
                onChange={setPendingContributorInput}
                options={contributorComboboxOptions}
                disabled={peopleLoading}
                onSubmit={async (picked) => {
                  if (picked.kind === "tmdb") {
                    await onAddContributor(nomination.id, {
                      tmdb_id: picked.tmdb_id,
                      name: picked.name
                    });
                  } else if (picked.kind === "person") {
                    await onAddContributor(nomination.id, {
                      person_id: picked.person_id
                    });
                  } else if (picked.kind === "create") {
                    await onAddContributor(nomination.id, { name: picked.name });
                  }
                  setPendingContributorInput("");
                }}
              />
            </Box>
            <Button
              type="button"
              variant="subtle"
              onClick={() => {
                if (pendingContributorInput.trim()) {
                  void onAddContributor(nomination.id, {
                    name: pendingContributorInput.trim()
                  });
                  setPendingContributorInput("");
                }
              }}
              disabled={!pendingContributorInput.trim()}
            >
              Add
            </Button>
          </Group>
        </Box>
      </Stack>
    </Modal>
  );
}
