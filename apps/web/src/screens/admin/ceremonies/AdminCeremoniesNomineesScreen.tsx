import { formatFilmTitleWithYear } from "../../../lib/films";
import {
  ActionIcon,
  Box,
  Button,
  Combobox,
  FileInput,
  Group,
  InputBase,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip
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
  useSortable,
  verticalListSortingStrategy,
  arrayMove
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useState } from "react";
import type { AdminCeremonyNomineesOrchestration } from "../../../orchestration/adminCeremoniesNominees";
import { FormStatus } from "../../../ui/forms";
import { notify } from "../../../notifications";
import { useCombobox } from "@mantine/core";
import { fetchJson } from "../../../lib/api";
import { StandardCard } from "../../../primitives";
import { includesNormalized, normalizeForSearch } from "@fantasy-oscars/shared";
import "../../../primitives/baseline.css";

function materialGlyph(code: string | null | undefined) {
  const raw = (code ?? "").trim();
  if (!raw) return "";
  if (/^[0-9a-f]{4}$/i.test(raw)) return String.fromCharCode(Number.parseInt(raw, 16));
  return raw;
}

function nominationPrimaryLabel(input: {
  unit_kind: "FILM" | "SONG" | "PERFORMANCE";
  film_title?: string | null;
  song_title?: string | null;
  performer_name?: string | null;
  contributors?: Array<{ full_name: string; sort_order: number }>;
  fallbackId: number;
}) {
  if (input.unit_kind === "SONG")
    return input.song_title ?? `Nomination #${input.fallbackId}`;
  if (input.unit_kind === "PERFORMANCE") {
    const names =
      input.contributors && input.contributors.length > 0
        ? [...input.contributors]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((c) => c.full_name)
            .filter(Boolean)
        : [];
    if (names.length > 0) return names.join(", ");
    return input.performer_name ?? `Nomination #${input.fallbackId}`;
  }
  return input.film_title ?? `Nomination #${input.fallbackId}`;
}

function nominationSecondaryLabel(input: {
  unit_kind: "FILM" | "SONG" | "PERFORMANCE";
  film_title?: string | null;
}) {
  if (input.unit_kind === "PERFORMANCE" && input.film_title)
    return `from ${input.film_title}`;
  return null;
}

function SortableNominationRow(props: {
  id: number;
  primary: React.ReactNode;
  secondary: React.ReactNode;
  onRemove: () => void;
  onEdit: () => void;
  removing: boolean;
  isDropTarget: boolean;
}) {
  const { id, primary, secondary, onRemove, onEdit, removing, isDropTarget } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  return (
    <Group
      ref={setNodeRef}
      className={[
        "nomination-row",
        "nomination-row-compact",
        isDragging ? "is-dragging" : "",
        isDropTarget ? "is-drop-target" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      justify="space-between"
      align="center"
      wrap="nowrap"
      style={{
        transform: CSS.Transform.toString(transform),
        transition
      }}
    >
      <Group gap="sm" align="center" wrap="nowrap" style={{ minWidth: 0 }}>
        <Box
          component="button"
          type="button"
          className="nomination-drag-handle-button"
          {...attributes}
          {...listeners}
          aria-label="Reorder nomination"
          aria-roledescription="draggable"
          aria-grabbed={isDragging}
        >
          <Text
            component="span"
            className="gicon nomination-drag-handle"
            aria-hidden="true"
          >
            drag_indicator
          </Text>
        </Box>
        <Box style={{ minWidth: 0 }}>
          <Text className="nomination-title" fw={700} lineClamp={1}>
            {primary}
          </Text>
          {secondary ? (
            <Text className="nomination-subtitle" size="sm" lineClamp={1}>
              {secondary}
            </Text>
          ) : null}
        </Box>
      </Group>

      <Group gap="xs" wrap="nowrap">
        <Tooltip label="Edit nomination" withArrow>
          <ActionIcon
            type="button"
            variant="subtle"
            aria-label="Edit nomination"
            onClick={onEdit}
            disabled={removing}
          >
            <Text component="span" className="gicon" aria-hidden="true">
              edit
            </Text>
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Remove nomination" withArrow>
          <ActionIcon
            type="button"
            variant="subtle"
            aria-label="Remove nomination"
            onClick={onRemove}
            disabled={removing}
            className="nomination-trash"
          >
            <Text component="span" className="gicon" aria-hidden="true">
              {String.fromCharCode(0xe872)}
            </Text>
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
}

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
            <Stack gap={0} className="nomination-list">
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
          onLinkFilm={async (filmId, tmdbId) => {
            const r = await linkFilmTmdb(filmId, tmdbId);
            if (r.ok) {
              notify({
                id: "admin.nominees.film.link.success",
                severity: "success",
                trigger_type: "user_action",
                scope: "local",
                durability: "ephemeral",
                requires_decision: false,
                title: tmdbId ? "Film linked" : "Film unlinked",
                message: tmdbId
                  ? r.hydrated
                    ? "Hydrated details from TMDB."
                    : "Linked."
                  : "Unlinked."
              });
            } else {
              notify({
                id: "admin.nominees.film.link.error",
                severity: "error",
                trigger_type: "user_action",
                scope: "local",
                durability: "ephemeral",
                requires_decision: false,
                title: tmdbId ? "Could not link film" : "Could not unlink film",
                message: r.error ?? "Failed to update film"
              });
            }
          }}
          onLinkPerson={async (personId, tmdbId) => {
            const r = await linkPersonTmdb(personId, tmdbId);
            if (r.ok) {
              notify({
                id: "admin.nominees.person.link.success",
                severity: "success",
                trigger_type: "user_action",
                scope: "local",
                durability: "ephemeral",
                requires_decision: false,
                title: tmdbId ? "Contributor linked" : "Contributor unlinked",
                message: tmdbId
                  ? r.hydrated
                    ? "Hydrated details from TMDB."
                    : "Linked."
                  : "Unlinked."
              });
            } else {
              notify({
                id: "admin.nominees.person.link.error",
                severity: "error",
                trigger_type: "user_action",
                scope: "local",
                durability: "ephemeral",
                requires_decision: false,
                title: tmdbId
                  ? "Could not link contributor"
                  : "Could not unlink contributor",
                message: r.error ?? "Failed to update contributor"
              });
            }
          }}
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

function FilmCombobox(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  films: Array<{ id: number; title: string; release_year?: number | null }>;
}) {
  const { label, value, onChange, films } = props;

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption()
  });

  const data = useMemo(() => {
    const q = value;
    const list = films
      .map((f) => ({
        id: f.id,
        label: formatFilmTitleWithYear(f.title, f.release_year ?? null)
      }))
      .filter((f) => includesNormalized(f.label, q))
      .slice(0, 50);
    return list;
  }, [films, value]);

  const hasExactMatch = useMemo(() => {
    const t = normalizeForSearch(value);
    if (!t) return true;
    return films.some(
      (f) =>
        normalizeForSearch(formatFilmTitleWithYear(f.title, f.release_year ?? null)) === t
    );
  }, [films, value]);

  return (
    <Combobox
      store={combobox}
      withinPortal={false}
      onOptionSubmit={(val) => {
        if (val.startsWith("create:")) {
          const title = val.slice("create:".length);
          onChange(title);
          combobox.closeDropdown();
          return;
        }
        if (val.startsWith("film:")) {
          const label = val.slice("film:".length);
          onChange(label);
          combobox.closeDropdown();
          return;
        }
        onChange(val);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <InputBase
          label={label}
          component="input"
          value={value}
          onChange={(e) => {
            onChange(e.currentTarget.value);
            combobox.openDropdown();
          }}
          onFocus={() => combobox.openDropdown()}
          placeholder="Type film title or id…"
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          {!hasExactMatch && value.trim() ? (
            <Combobox.Option value={`create:${value.trim()}`}>
              <Text size="sm" fw={700}>
                Create film: {value.trim()}
              </Text>
            </Combobox.Option>
          ) : null}

          {data.length === 0 ? (
            <Combobox.Empty>
              <Text size="sm" className="muted">
                No matching films
              </Text>
            </Combobox.Empty>
          ) : (
            data.map((f) => (
              <Combobox.Option key={f.id} value={`film:${f.label}`}>
                <Text size="sm">{f.label}</Text>
              </Combobox.Option>
            ))
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
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
  onLinkFilm: (filmId: number, tmdbId: number | null) => Promise<void>;
  onLinkPerson: (personId: number, tmdbId: number | null) => Promise<void>;
  onAddContributor: (
    nominationId: number,
    input: { person_id?: number; name?: string; tmdb_id?: number }
  ) => Promise<void>;
  onRemoveContributor: (
    nominationId: number,
    nominationContributorId: number
  ) => Promise<void>;
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
    onRemoveContributor
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

  const contributorComboboxOptions = useMemo(() => {
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
      const res = await fetchJson<{ credits: unknown | null }>(
        `/admin/films/${filmId}/credits`,
        {
          method: "GET"
        }
      );
      if (!res.ok) {
        setFilmCredits(null);
        return;
      }
      const creditsUnknown = res.data?.credits;
      if (!creditsUnknown || typeof creditsUnknown !== "object") {
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
  }, [filmId, filmLinked]);

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
                  onClick={() => setFilmLinkOpen((v) => !v)}
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
              <Button
                type="button"
                onClick={() =>
                  void (async () => {
                    await onLinkFilm(
                      filmId,
                      filmTmdbId.trim() ? Number(filmTmdbId.trim()) : null
                    );
                    setFilmLinkOpen(false);
                    setFilmTmdbId("");
                  })()
                }
              >
                Save
              </Button>
            </Group>
          ) : null}
        </Box>

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
                        setPersonTmdbId("");
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
              <Button
                type="button"
                onClick={() =>
                  void onLinkPerson(
                    personLinkOpenId,
                    personTmdbId.trim() ? Number(personTmdbId.trim()) : null
                  )
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

type ContributorOption =
  | { kind: "tmdb"; value: string; label: string; name: string; tmdb_id: number }
  | { kind: "person"; value: string; label: string; name: string; person_id: number }
  | { kind: "create"; value: string; label: string; name: string };

function ContributorCombobox(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ContributorOption[];
  disabled: boolean;
  onSubmit: (picked: ContributorOption) => Promise<void>;
}) {
  const { label, value, onChange, options, disabled, onSubmit } = props;
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption()
  });

  const optionByValue = useMemo(() => {
    const map = new Map<string, (typeof options)[number]>();
    for (const o of options) map.set(o.value, o);
    return map;
  }, [options]);

  return (
    <Combobox
      store={combobox}
      withinPortal={false}
      onOptionSubmit={(val) => {
        const picked = optionByValue.get(val);
        if (!picked) return;
        void onSubmit(picked);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <InputBase
          label={label}
          component="input"
          value={value}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.currentTarget.value);
            combobox.openDropdown();
          }}
          onFocus={() => combobox.openDropdown()}
          placeholder="Search people…"
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          {options.length === 0 ? (
            <Combobox.Empty>
              <Text size="sm" className="muted">
                No matching people
              </Text>
            </Combobox.Empty>
          ) : (
            options.map((o) => (
              <Combobox.Option key={o.value} value={o.value}>
                <Text size="sm" fw={o.kind === "create" ? 700 : 400}>
                  {o.label}
                </Text>
              </Combobox.Option>
            ))
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
