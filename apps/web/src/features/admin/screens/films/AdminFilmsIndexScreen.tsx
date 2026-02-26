import {
  Box,
  Button,
  Divider,
  Group,
  Menu,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title
} from "@ui";
import { useMemo, useState } from "react";
import { StandardCard } from "@/primitives/cards/StandardCard";
import { notify } from "@/notifications";
import type { AdminFilmRow } from "@/orchestration/admin/filmsIndex/orchestration";
import "@/primitives/baseline.css";

type LinkEditFilm = {
  id: number;
  title: string;
  tmdb_id: number | null;
};

export function AdminFilmsIndexScreen(props: {
  query: string;
  setQuery: (v: string) => void;
  year: string;
  setYear: (v: string) => void;
  linked: "all" | "linked" | "unlinked";
  setLinked: (v: "all" | "linked" | "unlinked") => void;
  nominated: "all" | "nominated" | "not_nominated";
  setNominated: (v: "all" | "nominated" | "not_nominated") => void;
  loading: boolean;
  status: { ok: true } | { ok: false; message: string } | null;
  films: AdminFilmRow[];
  years: number[];
  linkWorkingFilmId: number | null;
  onReload: () => void;
  onSaveTmdbId: (filmId: number, tmdbId: number | null) => Promise<{ ok: boolean }>;
}) {
  const [editingFilm, setEditingFilm] = useState<LinkEditFilm | null>(null);
  const [tmdbInput, setTmdbInput] = useState("");

  const activeFilters = useMemo(() => {
    let count = 0;
    if (props.year !== "all") count += 1;
    if (props.linked !== "all") count += 1;
    if (props.nominated !== "all") count += 1;
    return count;
  }, [props.linked, props.nominated, props.year]);

  const yearOptions = useMemo(
    () => [
      { value: "all", label: "All years" },
      ...props.years.map((y) => ({ value: String(y), label: String(y) }))
    ],
    [props.years]
  );

  return (
    <Stack gap="md">
      <Stack gap="var(--fo-space-4)">
        <Title order={2} className="baseline-textHeroTitle">
          Films
        </Title>
        <Text className="baseline-textBody">
          Search and maintain film records, including TMDB links and nomination status.
        </Text>
      </Stack>

      <Group align="flex-end" gap="sm" wrap="wrap">
        <Box className="fo-flexFieldMd">
          <TextInput
            label="Search films"
            placeholder="Film title"
            value={props.query}
            onChange={(e) => props.setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") props.onReload();
            }}
          />
        </Box>
        <Menu closeOnItemClick={false} withinPortal position="bottom-end">
          <Menu.Target>
            <Button variant="default">
              Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Box p="sm" style={{ width: 260 }}>
              <Stack gap="xs">
                <Select
                  label="Year"
                  data={yearOptions}
                  value={props.year}
                  onChange={(v) => props.setYear(v ?? "all")}
                />
                <Select
                  label="TMDB link"
                  data={[
                    { value: "all", label: "All" },
                    { value: "linked", label: "Linked" },
                    { value: "unlinked", label: "Unlinked" }
                  ]}
                  value={props.linked}
                  onChange={(v) =>
                    props.setLinked(
                      v === "linked" || v === "unlinked" || v === "all" ? v : "all"
                    )
                  }
                />
                <Select
                  label="Nomination status"
                  data={[
                    { value: "all", label: "All" },
                    { value: "nominated", label: "Nominated" },
                    { value: "not_nominated", label: "Not nominated" }
                  ]}
                  value={props.nominated}
                  onChange={(v) =>
                    props.setNominated(
                      v === "nominated" || v === "not_nominated" || v === "all"
                        ? v
                        : "all"
                    )
                  }
                />
                <Group justify="flex-end">
                  <Button
                    variant="subtle"
                    onClick={() => {
                      props.setYear("all");
                      props.setLinked("all");
                      props.setNominated("all");
                    }}
                  >
                    Clear
                  </Button>
                </Group>
              </Stack>
            </Box>
          </Menu.Dropdown>
        </Menu>
        <Button variant="default" loading={props.loading} onClick={props.onReload}>
          Search
        </Button>
      </Group>

      {props.status && !props.status.ok ? (
        <Text className="baseline-textBody">{props.status.message}</Text>
      ) : null}

      {props.films.length === 0 ? (
        <Text className="baseline-textBody">No films matched your filters.</Text>
      ) : (
        <Stack gap="sm">
          {props.films.map((film) => (
            <StandardCard key={film.id}>
              <Group justify="space-between" align="center" wrap="wrap">
                <Box miw="var(--fo-space-0)">
                  <Text fw="var(--fo-font-weight-bold)" className="baseline-textBody">
                    {film.title}
                    {film.release_year ? ` (${film.release_year})` : ""}
                  </Text>
                  <Text className="baseline-textMeta">Film #{film.id}</Text>
                </Box>

                <Group gap="xs" wrap="wrap" justify="flex-end">
                  <Box component="span" className="baseline-statusPill">
                    <Text
                      className="baseline-textMeta fo-letterSpacingTracked"
                      fw="var(--fo-font-weight-bold)"
                    >
                      {film.release_year ? String(film.release_year) : "YEAR UNKNOWN"}
                    </Text>
                  </Box>

                  <Box component="span" className="baseline-statusPill">
                    <Text
                      className="baseline-textMeta fo-letterSpacingTracked"
                      fw="var(--fo-font-weight-bold)"
                    >
                      {film.is_nominated ? "NOMINATED" : "NOT NOMINATED"}
                    </Text>
                  </Box>

                  <Button
                    variant="default"
                    size="xs"
                    onClick={() => {
                      setEditingFilm({
                        id: film.id,
                        title: film.title,
                        tmdb_id: film.tmdb_id
                      });
                      setTmdbInput(film.tmdb_id ? String(film.tmdb_id) : "");
                    }}
                  >
                    {film.tmdb_id ? "Linked" : "Unlinked"}
                  </Button>
                </Group>
              </Group>
            </StandardCard>
          ))}
        </Stack>
      )}

      <Modal
        opened={Boolean(editingFilm)}
        onClose={() => setEditingFilm(null)}
        title="Link film to TMDB"
        centered
        size="md"
        overlayProps={{ opacity: 0.35, blur: 2 }}
      >
        <Stack gap="sm">
          <Text className="baseline-textBody">
            {editingFilm?.title ?? "Untitled film"}
          </Text>
          <Text className="baseline-textMeta">
            Saving hydrates film metadata from TMDB when available.
          </Text>
          <TextInput
            label="TMDB id"
            placeholder="603"
            value={tmdbInput}
            onChange={(e) => setTmdbInput(e.currentTarget.value)}
          />
          <Group justify="space-between" align="center">
            <Button
              variant="subtle"
              disabled={
                !editingFilm?.tmdb_id ||
                (editingFilm ? props.linkWorkingFilmId === editingFilm.id : false)
              }
              onClick={() => {
                if (!editingFilm) return;
                void props.onSaveTmdbId(editingFilm.id, null).then((res) => {
                  if (!res.ok) return;
                  setEditingFilm(null);
                  setTmdbInput("");
                });
              }}
            >
              Remove link
            </Button>
            <Button
              loading={editingFilm ? props.linkWorkingFilmId === editingFilm.id : false}
              onClick={() => {
                if (!editingFilm) return;
                const trimmed = tmdbInput.trim();
                const tmdbId = trimmed ? Number(trimmed) : null;
                if (tmdbId !== null && (!Number.isInteger(tmdbId) || tmdbId <= 0)) {
                  notify({
                    id: `admin_films_link_validation_${editingFilm.id}`,
                    severity: "error",
                    trigger_type: "user_action",
                    scope: "local",
                    durability: "ephemeral",
                    requires_decision: false,
                    title: "Invalid TMDB id",
                    message: "Provide a positive numeric TMDB id."
                  });
                  return;
                }
                void props.onSaveTmdbId(editingFilm.id, tmdbId).then((res) => {
                  if (!res.ok) return;
                  setEditingFilm(null);
                  setTmdbInput("");
                });
              }}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Divider />
    </Stack>
  );
}
