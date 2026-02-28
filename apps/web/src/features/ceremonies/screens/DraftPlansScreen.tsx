import {
  Alert,
  Box,
  Button,
  Combobox,
  Group,
  Modal,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
  useCombobox
} from "@ui";
import { PageError } from "@/shared/page-state";
import type { CeremonyDetail } from "@/orchestration/ceremonies";
import type { useDraftPlansOrchestration } from "@/orchestration/draftPlans";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { arrayMove } from "@dnd-kit/sortable";
import { NomineeTooltipCard } from "@/features/draft/components/NomineeTooltipCard";
import { useMemo, useState, type ReactNode } from "react";
import { StandardCard } from "@/primitives";
import { SortableNomineeRow } from "@/features/ceremonies/ui/draftPlans/SortableNomineeRow";
import {
  computeDefaultNominationIdsForDraftPlan,
  computeEffectiveNomineeOrderForDraftPlan,
  filterDraftPlansByName
} from "@/decisions/draftPlans";
import "@/primitives/baseline.css";

const EMPTY_CATEGORIES: CeremonyDetail["categories"] = [];
const EMPTY_NOMINATIONS: CeremonyDetail["nominations"] = [];
const CSV_MAX_BYTES = 512 * 1024;

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (ch === "\r") continue;
    field += ch;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

export function DraftPlansScreen(props: {
  ceremonyState: "loading" | "error" | "ready";
  ceremonyError: string | null;
  detail: CeremonyDetail | null;
  plans: ReturnType<typeof useDraftPlansOrchestration>;
}) {
  const { plans: o } = props;

  // Hooks must not be conditional (Rules of Hooks).
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption()
  });
  const [planQuery, setPlanQuery] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFilename, setUploadFilename] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadRows, setUploadRows] = useState<
    Array<{ category: string; nominee: string }>
  >([]);

  const ceremony = props.detail?.ceremony ?? null;
  const categories = props.detail?.categories ?? EMPTY_CATEGORIES;
  const nominations = props.detail?.nominations ?? EMPTY_NOMINATIONS;

  const label = ceremony?.name?.trim() || ceremony?.code?.trim() || "Ceremony";

  const filteredPlans = useMemo(() => {
    return filterDraftPlansByName(o.plans, planQuery);
  }, [o.plans, planQuery]);

  const categoryById = useMemo(
    () =>
      new Map(
        categories.map((c) => [
          c.id,
          {
            unitKind: c.unit_kind,
            name: c.family_name,
            sortIndex: c.sort_index,
            icon: c.icon_code ?? "trophy",
            iconVariant: c.icon_variant as "default" | "inverted"
          }
        ])
      ),
    [categories]
  );

  const defaultNominationIds = useMemo(() => {
    return computeDefaultNominationIdsForDraftPlan({ categories, nominations });
  }, [categories, nominations]);

  const effectiveOrder = useMemo(() => {
    return computeEffectiveNomineeOrderForDraftPlan({
      selectedPlanId: o.selectedPlanId,
      planOrder: o.order,
      defaultOrder: defaultNominationIds,
      nominations
    });
  }, [defaultNominationIds, nominations, o.order, o.selectedPlanId]);

  const nominationById = useMemo(
    () => new Map(nominations.map((n) => [n.id, n])),
    [nominations]
  );

  const tooltipByNominationId = useMemo(() => {
    const m = new Map<number, ReactNode>();
    for (const n of nominations) {
      const cat = categoryById.get(n.category_edition_id);
      if (!cat) continue;
      m.set(
        n.id,
        <NomineeTooltipCard
          unitKind={String(cat.unitKind ?? "")}
          categoryName={cat.name}
          filmTitle={n.film_title ?? null}
          filmYear={n.film_year ?? null}
          filmPosterUrl={
            (n as { film_poster_url?: string | null }).film_poster_url ?? null
          }
          contributors={(n.contributors ?? []) as string[]}
          performerName={(n as { performer_name?: string | null }).performer_name ?? null}
          performerCharacter={
            (n as { performer_character?: string | null }).performer_character ?? null
          }
          performerProfileUrl={
            (n as { performer_profile_url?: string | null }).performer_profile_url ?? null
          }
          performerProfilePath={
            (n as { performer_profile_path?: string | null }).performer_profile_path ??
            null
          }
          performerContributors={
            (
              n as {
                performer_contributors?: Array<{
                  full_name?: string | null;
                  role_label?: string | null;
                  profile_url?: string | null;
                  profile_path?: string | null;
                  sort_order?: number | null;
                }>;
              }
            ).performer_contributors?.map((c, idx) => ({
              fullName: String(c.full_name ?? "").trim(),
              roleLabel: c.role_label ?? null,
              profileUrl: c.profile_url ?? null,
              profilePath: c.profile_path ?? null,
              sortOrder: typeof c.sort_order === "number" ? c.sort_order : idx + 1
            })) ?? []
          }
          songTitle={(n as { song_title?: string | null }).song_title ?? null}
        />
      );
    }
    return m;
  }, [categoryById, nominations]);

  const nomineeKeyById = useMemo(() => {
    const m = new Map<number, string>();
    for (const n of nominations) {
      const cat = categoryById.get(n.category_edition_id);
      const categoryName = String(
        cat?.name ?? `Category ${n.category_edition_id}`
      ).trim();
      const nominee = String(n.label ?? "").trim();
      m.set(n.id, `${categoryName.toLocaleLowerCase()}||${nominee.toLocaleLowerCase()}`);
    }
    return m;
  }, [categoryById, nominations]);

  const nominationIdsByKey = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const n of nominations) {
      const key = nomineeKeyById.get(n.id);
      if (!key) continue;
      const existing = m.get(key) ?? [];
      existing.push(n.id);
      m.set(key, existing);
    }
    return m;
  }, [nominations, nomineeKeyById]);

  const applyUploadedOrder = async () => {
    if (!o.selectedPlanId) return;
    if (uploadRows.length === 0) {
      setUploadError("Upload a CSV file first.");
      return;
    }
    const expectedIds = new Set(effectiveOrder);
    const next: number[] = [];
    for (let i = 0; i < uploadRows.length; i++) {
      const r = uploadRows[i];
      const key = `${r.category.toLocaleLowerCase()}||${r.nominee.toLocaleLowerCase()}`;
      const candidates = (nominationIdsByKey.get(key) ?? []).filter((id) =>
        expectedIds.has(id)
      );
      if (candidates.length === 0) {
        setUploadError(`Row ${i + 1}: nominee not found in this ceremony/plan.`);
        return;
      }
      if (candidates.length > 1) {
        setUploadError(
          `Row ${i + 1}: nominee mapping is ambiguous. Ensure category + nominee pair is unique.`
        );
        return;
      }
      next.push(candidates[0]);
    }
    const unique = new Set(next);
    if (unique.size !== next.length) {
      setUploadError("Upload contains duplicate nominees.");
      return;
    }
    if (next.length !== expectedIds.size) {
      setUploadError("Upload count does not match this plan.");
      return;
    }
    for (const id of expectedIds) {
      if (!unique.has(id)) {
        setUploadError("Upload is missing one or more nominees required by this plan.");
        return;
      }
    }
    setUploading(true);
    setUploadError(null);
    o.setOrder(next);
    const ok = await o.saveOrder(o.selectedPlanId, next);
    setUploading(false);
    if (!ok) {
      setUploadError(o.error ?? "Could not apply uploaded order.");
      return;
    }
    setUploadOpen(false);
    setUploadFilename(null);
    setUploadRows([]);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  if (props.ceremonyState === "loading")
    return (
      <Box className="baseline-page">
        <Box className="baseline-pageInner">
          <StandardCard component="section">
            <Stack gap="md" role="status" aria-label="Loading draft plans">
              <Skeleton height="var(--fo-font-size-hero-title)" width="34%" />
              <Skeleton height="var(--fo-font-size-sm)" width="42%" />
              <Box className="draft-plans-controls">
                <Box className="draft-plans-selectWrap">
                  <Skeleton height="56px" width="100%" />
                </Box>
                <Group gap="sm" wrap="nowrap" className="draft-plans-actions">
                  <Skeleton height="36px" width="120px" />
                  <Skeleton height="36px" width="120px" />
                </Group>
              </Box>
              <Stack gap="xs">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <Skeleton key={idx} height="44px" width="100%" />
                ))}
              </Stack>
            </Stack>
          </StandardCard>
        </Box>
      </Box>
    );
  if (props.ceremonyState === "error")
    return <PageError message={props.ceremonyError ?? "Failed to load"} />;
  if (!props.detail) return <PageError message="Ceremony not found" />;

  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <StandardCard component="section">
          <Stack gap="md">
            <header>
              <Box>
                <Title order={2} className="baseline-textHeroTitle">
                  Draft plans
                </Title>
                <Text className="baseline-textBody">{label}</Text>
              </Box>
            </header>

            <Text className="baseline-textBody">
              Configure your personal draft order for this ceremony.
            </Text>

            <Box className="draft-plans-controls">
              <Box className="draft-plans-selectWrap">
                <Combobox
                  store={combobox}
                  withinPortal
                  position="bottom-start"
                  middlewares={{ flip: true, shift: true }}
                  onOptionSubmit={async (value) => {
                    if (value.startsWith("create:")) {
                      const name = value.slice("create:".length);
                      if (!name.trim()) return;
                      await o.createPlan(name.trim());
                      setPlanQuery("");
                      combobox.closeDropdown();
                      return;
                    }
                    const planId = Number(value);
                    if (!Number.isFinite(planId)) return;
                    await o.loadPlan(planId);
                    combobox.closeDropdown();
                  }}
                >
                  <Combobox.Target>
                    <TextInput
                      label="Plan name"
                      placeholder="Choose a plan..."
                      value={o.selectedPlanName ?? planQuery}
                      onChange={(e) => {
                        const v = e.currentTarget.value;
                        setPlanQuery(v);
                        // Editing the input implies selecting/searching.
                        o.setSelectedPlanId(null);
                        o.setSelectedPlanName(null);
                        combobox.openDropdown();
                        combobox.updateSelectedOptionIndex();
                      }}
                      onFocus={() => combobox.openDropdown()}
                      rightSection={
                        <Text component="span" className="gicon" aria-hidden="true">
                          expand_more
                        </Text>
                      }
                    />
                  </Combobox.Target>

                  <Combobox.Dropdown>
                    <Combobox.Options>
                      {planQuery.trim().length > 0 && (
                        <Combobox.Option value={`create:${planQuery.trim()}`}>
                          Create “{planQuery.trim()}”
                        </Combobox.Option>
                      )}
                      {filteredPlans.map((p) => (
                        <Combobox.Option key={p.id} value={String(p.id)}>
                          {p.name}
                        </Combobox.Option>
                      ))}
                      {filteredPlans.length === 0 && planQuery.trim().length === 0 ? (
                        <Combobox.Empty>
                          No plans yet. Type a name to create one.
                        </Combobox.Empty>
                      ) : null}
                    </Combobox.Options>
                  </Combobox.Dropdown>
                </Combobox>
              </Box>
              <Group gap="sm" wrap="nowrap" className="draft-plans-actions">
                <Button
                  type="button"
                  variant="default"
                  disabled={!o.selectedPlanId || effectiveOrder.length === 0}
                  leftSection={
                    <Text component="span" className="gicon" aria-hidden="true">
                      download
                    </Text>
                  }
                  onClick={() => {
                    if (!o.selectedPlanId || effectiveOrder.length === 0) return;
                    const rows = effectiveOrder
                      .map((id) => {
                        const n = nominationById.get(id);
                        if (!n) return null;
                        const cat = categoryById.get(n.category_edition_id);
                        const categoryName = String(
                          cat?.name ?? `Category ${n.category_edition_id}`
                        ).trim();
                        const nominee = String(n.label ?? "").trim();
                        return `${csvEscape(categoryName)},${csvEscape(nominee)}`;
                      })
                      .filter((v): v is string => Boolean(v));
                    const csv = ["Category,Nominee", ...rows].join("\n");
                    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                    const a = document.createElement("a");
                    const url = URL.createObjectURL(blob);
                    a.href = url;
                    const base =
                      (o.selectedPlanName ?? "draft-plan").trim() || "draft-plan";
                    a.download = `${base.replace(/[^\w.-]+/g, "_")}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download
                </Button>
                <Button
                  type="button"
                  variant="default"
                  disabled={!o.selectedPlanId || effectiveOrder.length === 0}
                  leftSection={
                    <Text component="span" className="gicon" aria-hidden="true">
                      upload
                    </Text>
                  }
                  onClick={() => {
                    setUploadOpen(true);
                    setUploadFilename(null);
                    setUploadRows([]);
                    setUploadError(null);
                  }}
                >
                  Upload
                </Button>
              </Group>
            </Box>

            {o.selectedPlanId ? (
              <StandardCard component="section" tone="nested">
                <Stack gap="xs">
                  <Group justify="space-between" wrap="nowrap">
                    <Title order={4} className="baseline-textSectionHeader">
                      Nominees
                    </Title>
                    {o.saving ? <Text className="baseline-textMeta">Saving…</Text> : null}
                  </Group>

                  {effectiveOrder.length === 0 ? (
                    <Text className="baseline-textBody">No nominees.</Text>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      onDragEnd={async (event) => {
                        const { active, over } = event;
                        if (!over || active.id === over.id) return;
                        const activeId = Number(active.id);
                        const overId = Number(over.id);
                        if (!Number.isFinite(activeId) || !Number.isFinite(overId))
                          return;
                        const oldIndex = effectiveOrder.indexOf(activeId);
                        const newIndex = effectiveOrder.indexOf(overId);
                        if (oldIndex < 0 || newIndex < 0) return;
                        const next = arrayMove(effectiveOrder, oldIndex, newIndex);
                        o.setOrder(next);
                        await o.saveOrder(o.selectedPlanId!, next);
                      }}
                    >
                      <SortableContext
                        items={effectiveOrder}
                        strategy={verticalListSortingStrategy}
                      >
                        <Stack
                          gap="var(--fo-space-0)"
                          role="list"
                          aria-label="Nominee order"
                        >
                          {effectiveOrder.map((id) => {
                            const n = nominationById.get(id);
                            if (!n) return null;
                            const cat = categoryById.get(n.category_edition_id);
                            if (!cat) return null;
                            const tooltip = tooltipByNominationId.get(id) ?? null;
                            const currentIndex = effectiveOrder.indexOf(id) + 1;
                            return (
                              <SortableNomineeRow
                                key={id}
                                id={id}
                                icon={cat.icon}
                                iconVariant={cat.iconVariant}
                                label={n.label}
                                tooltip={tooltip}
                                index={currentIndex}
                                maxIndex={effectiveOrder.length}
                                onJumpToIndex={async (nextIndex) => {
                                  const oldIndex = effectiveOrder.indexOf(id);
                                  if (oldIndex < 0) return;
                                  const target = Math.min(
                                    effectiveOrder.length - 1,
                                    Math.max(0, nextIndex - 1)
                                  );
                                  if (oldIndex === target) return;
                                  const next = arrayMove(
                                    effectiveOrder,
                                    oldIndex,
                                    target
                                  );
                                  o.setOrder(next);
                                  await o.saveOrder(o.selectedPlanId!, next);
                                }}
                              />
                            );
                          })}
                        </Stack>
                      </SortableContext>
                    </DndContext>
                  )}
                </Stack>
              </StandardCard>
            ) : null}
          </Stack>
        </StandardCard>
      </Box>
      <Modal
        opened={uploadOpen}
        onClose={() => {
          setUploadOpen(false);
          setUploadError(null);
        }}
        title="Upload draft order"
        centered
      >
        <Stack gap="sm">
          <Text className="baseline-textBody">
            Upload a CSV exported from this screen. Order is inferred from row order.
          </Text>
          <Box
            component="input"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0] ?? null;
              setUploadFilename(file?.name ?? null);
              setUploadRows([]);
              setUploadError(null);
              if (!file) return;
              if (file.size > CSV_MAX_BYTES) {
                setUploadError("File too large.");
                return;
              }
              void (async () => {
                const text = await file.text();
                if (text.includes("\0")) {
                  setUploadError("Invalid CSV content.");
                  return;
                }
                const table = parseCsv(text);
                if (table.length < 2) {
                  setUploadError("CSV is empty.");
                  return;
                }
                const headers = table[0].map((h) => h.trim().toLowerCase());
                const categoryIdx = headers.indexOf("category");
                const nomineeIdx = headers.indexOf("nominee");
                if (categoryIdx < 0 || nomineeIdx < 0) {
                  setUploadError("CSV headers must include Category and Nominee.");
                  return;
                }
                const rows = table
                  .slice(1)
                  .map((r) => ({
                    category: String(r[categoryIdx] ?? "").trim(),
                    nominee: String(r[nomineeIdx] ?? "").trim()
                  }))
                  .filter((r) => r.category.length > 0 || r.nominee.length > 0);
                if (rows.length === 0) {
                  setUploadError("CSV contains no data rows.");
                  return;
                }
                for (let i = 0; i < rows.length; i++) {
                  if (!rows[i].category || !rows[i].nominee) {
                    setUploadError(
                      `Row ${i + 1}: both Category and Nominee are required.`
                    );
                    return;
                  }
                }
                if (rows.length !== effectiveOrder.length) {
                  setUploadError(
                    `CSV row count (${rows.length}) must match current plan size (${effectiveOrder.length}).`
                  );
                  return;
                }
                setUploadRows(rows);
              })();
            }}
          />
          {uploadFilename ? (
            <Alert color="blue" variant="light" role="status" aria-live="polite">
              Loaded: {uploadFilename}
            </Alert>
          ) : null}
          {uploadError ? (
            <Alert color="red" variant="light" role="alert" aria-live="assertive">
              {uploadError}
            </Alert>
          ) : null}
          <Group justify="end">
            <Button variant="subtle" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void applyUploadedOrder()}
              disabled={uploadRows.length === 0 || uploading}
            >
              Apply upload
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}
