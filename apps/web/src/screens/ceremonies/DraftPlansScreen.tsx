import {
  Box,
  Combobox,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
  useCombobox
} from "@mantine/core";
import { Tooltip } from "@mantine/core";
import { PageError, PageLoader } from "../../ui/page-state";
import type { CeremonyDetail } from "../../orchestration/ceremonies";
import type { useDraftPlansOrchestration } from "../../orchestration/draftPlans";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { arrayMove } from "@dnd-kit/sortable";
import { NomineeTooltipCard } from "../../components/draft/NomineeTooltipCard";
import { useMemo, useState, type ReactNode } from "react";
import { StandardCard } from "../../primitives";
import "../../primitives/baseline.css";

function DraftCategoryIcon(props: { icon: string; variant: "default" | "inverted" }) {
  if (props.variant === "inverted") {
    return (
      <Box
        component="span"
        className="mi-icon mi-icon-tiny dr-icon-punchout"
        aria-hidden="true"
      >
        {props.icon}
      </Box>
    );
  }
  return (
    <Box component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
      {props.icon}
    </Box>
  );
}

function SortableNomineeRow(props: {
  id: number;
  icon: string;
  iconVariant: "default" | "inverted";
  label: string;
  tooltip: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.id });

  return (
    <Tooltip.Floating
      label={props.tooltip}
      offset={14}
      position="right"
      styles={{
        tooltip: {
          padding: 0,
          background: "transparent",
          border: "none",
          boxShadow: "none"
        }
      }}
    >
      <Group
        ref={setNodeRef}
        className={["draft-plan-row", isDragging ? "is-dragging" : ""].join(" ")}
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
            className="draft-plan-drag"
            {...attributes}
            {...listeners}
            aria-label="Reorder nominee"
            aria-roledescription="draggable"
            aria-grabbed={isDragging}
          >
            <Text component="span" className="gicon" aria-hidden="true">
              drag_indicator
            </Text>
          </Box>
          <DraftCategoryIcon icon={props.icon} variant={props.iconVariant} />
          <Text className="draft-plan-rowText" lineClamp={1}>
            {props.label}
          </Text>
        </Group>
      </Group>
    </Tooltip.Floating>
  );
}

export function DraftPlansScreen(props: {
  ceremonyState: "loading" | "error" | "ready";
  ceremonyError: string | null;
  detail: CeremonyDetail | null;
  plans: ReturnType<typeof useDraftPlansOrchestration>;
}) {
  const { plans: o } = props;

  if (props.ceremonyState === "loading")
    return <PageLoader label="Loading draft plans..." />;
  if (props.ceremonyState === "error")
    return <PageError message={props.ceremonyError ?? "Failed to load"} />;
  if (!props.detail) return <PageError message="Ceremony not found" />;

  const { ceremony, categories, nominations } = props.detail;

  const label =
    ceremony.name?.trim() || ceremony.code?.trim() || `Ceremony #${ceremony.id}`;

  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const [planQuery, setPlanQuery] = useState("");

  const filteredPlans = o.plans.filter((p) =>
    p.name.toLowerCase().includes(planQuery.trim().toLowerCase())
  );

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
    const categoryIndex = new Map<number, number>();
    categories
      .slice()
      .sort((a, b) => a.sort_index - b.sort_index || a.id - b.id)
      .forEach((c, idx) => categoryIndex.set(c.id, idx));

    return nominations
      .map((n, idx) => ({ n, idx }))
      .sort((a, b) => {
        const ca = categoryIndex.get(a.n.category_edition_id) ?? 9999;
        const cb = categoryIndex.get(b.n.category_edition_id) ?? 9999;
        if (ca !== cb) return ca - cb;
        return a.idx - b.idx;
      })
      .map((x) => x.n.id);
  }, [categories, nominations]);

  const effectiveOrder = useMemo(() => {
    if (!o.selectedPlanId) return [];
    const fromPlan = o.order.length > 0 ? o.order : defaultNominationIds;
    const all = new Set(nominations.map((n) => n.id));
    const seen = new Set<number>();
    const ordered = fromPlan.filter((id) => {
      if (!all.has(id)) return false;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    // Append any new nominations not yet in the plan, in default order.
    for (const id of defaultNominationIds) {
      if (!seen.has(id)) ordered.push(id);
    }
    return ordered;
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
          songTitle={(n as { song_title?: string | null }).song_title ?? null}
        />
      );
    }
    return m;
  }, [categoryById, nominations]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

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

            <Box>
              <Combobox
                store={combobox}
                withinPortal={false}
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

            {o.selectedPlanId ? (
              <StandardCard component="section" className="nested">
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
                        <Stack gap={0}>
                          {effectiveOrder.map((id) => {
                            const n = nominationById.get(id);
                            if (!n) return null;
                            const cat = categoryById.get(n.category_edition_id);
                            if (!cat) return null;
                            const tooltip = tooltipByNominationId.get(id) ?? null;
                            return (
                              <SortableNomineeRow
                                key={id}
                                id={id}
                                icon={cat.icon}
                                iconVariant={cat.iconVariant}
                                label={n.label}
                                tooltip={tooltip}
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
    </Box>
  );
}
