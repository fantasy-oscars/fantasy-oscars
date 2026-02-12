import { Box, Group, Stack, Text } from "@ui";
import {
  DndContext,
  closestCenter,
  useSensors,
  type DragEndEvent,
  type DragOverEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove
} from "@dnd-kit/sortable";
import { useMemo, useState } from "react";
import { materialGlyph } from "../../../../decisions/admin/materialGlyph";
import {
  nominationPrimaryLabel,
  nominationSecondaryLabel
} from "../../../../decisions/admin/nominationLabels";
import { SortableNominationRow } from "../../../../ui/admin/ceremonies/nominees/SortableNominationRow";

export function CategoryNominationSection(props: {
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
          <Group gap="sm" align="center" wrap="nowrap" className="fo-minw0">
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
            <Stack
              gap="var(--fo-space-0)"
              className="nomination-list"
              role="list"
              aria-label={label}
            >
              {items.map((n) => (
                <SortableNominationRow
                  key={n.id}
                  id={n.id}
                  primary={
                    <Group gap="var(--fo-space-8)" wrap="nowrap">
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
