import { Combobox, Group, Image, InputBase, Stack, Text, useCombobox } from "@ui";
import { useEffect, useState } from "react";
import { includesNormalized, normalizeForSearch } from "@fantasy-oscars/shared";
import { formatFilmTitleWithYear } from "@/lib/films";
import { fetchJson } from "@/lib/api";

export function FilmCombobox(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCreateUnlinked: (title: string) => void;
  onSelectTmdbCandidate: (candidate: {
    tmdb_id: number;
    title: string;
    release_year: number | null;
  }) => void;
  onSelectFilm?: (film: {
    id: number;
    title: string;
    release_year?: number | null;
    tmdb_id?: number | null;
  }) => void;
  films: Array<{
    id: number;
    title: string;
    release_year?: number | null;
    tmdb_id?: number | null;
  }>;
}) {
  const {
    label,
    value,
    onChange,
    onCreateUnlinked,
    onSelectTmdbCandidate,
    onSelectFilm,
    films
  } = props;

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption()
  });
  const [mode, setMode] = useState<"local" | "tmdb">("local");
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const [tmdbResults, setTmdbResults] = useState<
    Array<{
      tmdb_id: number;
      title: string;
      original_title: string | null;
      release_year: number | null;
      poster_url: string | null;
      director: string | null;
      linked_film_id: number | null;
      linked_film_title: string | null;
    }>
  >([]);

  useEffect(() => {
    if (value.trim()) return;
    setMode("local");
    setTmdbResults([]);
    setTmdbLoading(false);
  }, [value]);

  useEffect(() => {
    if (mode !== "tmdb") {
      setTmdbResults([]);
      setTmdbLoading(false);
      return;
    }
    const q = value.trim();
    if (!q || q.length < 2) {
      setTmdbResults([]);
      setTmdbLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setTmdbLoading(true);
      void fetchJson<{
        results: Array<{
          tmdb_id: number;
          title: string;
          original_title: string | null;
          release_year: number | null;
          poster_url: string | null;
          director: string | null;
          linked_film_id: number | null;
          linked_film_title: string | null;
        }>;
      }>(`/admin/films/tmdb-search?q=${encodeURIComponent(q)}`, { method: "GET" }).then(
        (res) => {
          if (cancelled) return;
          setTmdbLoading(false);
          if (!res.ok) {
            setTmdbResults([]);
            return;
          }
          setTmdbResults(res.data?.results ?? []);
        }
      );
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode, value]);

  const groupedByTitle = new Map<
    string,
    Array<{
      id: number;
      title: string;
      release_year?: number | null;
      tmdb_id?: number | null;
    }>
  >();
  for (const f of films) {
    const key = normalizeForSearch(f.title);
    const bucket = groupedByTitle.get(key);
    if (bucket) bucket.push(f);
    else groupedByTitle.set(key, [f]);
  }

  const representativeFilms = Array.from(groupedByTitle.values()).map(
    (group) =>
      group.slice().sort((a, b) => {
        const aLinked = Number.isInteger(a.tmdb_id) ? 1 : 0;
        const bLinked = Number.isInteger(b.tmdb_id) ? 1 : 0;
        if (aLinked !== bLinked) return bLinked - aLinked;
        const aYear = Number.isInteger(a.release_year)
          ? Number(a.release_year)
          : -Infinity;
        const bYear = Number.isInteger(b.release_year)
          ? Number(b.release_year)
          : -Infinity;
        if (aYear !== bYear) return bYear - aYear;
        return a.id - b.id;
      })[0]
  );
  const representativeById = new Map(representativeFilms.map((f) => [f.id, f] as const));

  const data = representativeFilms
    .map((f) => {
      const label = formatFilmTitleWithYear(f.title, f.release_year ?? null);
      return { id: f.id, label };
    })
    .filter((f) => includesNormalized(f.label, value))
    .slice(0, 50);

  return (
    <Combobox
      store={combobox}
      withinPortal
      position="bottom-start"
      middlewares={{ flip: true, shift: true }}
      onOptionSubmit={(val) => {
        if (val.startsWith("mode:tmdb:")) {
          setMode("tmdb");
          combobox.openDropdown();
          return;
        }
        if (val.startsWith("create-unlinked:")) {
          const title = val.slice("create-unlinked:".length);
          onCreateUnlinked(title);
          setMode("local");
          combobox.closeDropdown();
          return;
        }
        if (val.startsWith("film:")) {
          const id = Number(val.slice("film:".length));
          const picked = representativeById.get(id);
          if (picked) {
            const label = formatFilmTitleWithYear(
              picked.title,
              picked.release_year ?? null
            );
            onChange(label);
            onSelectFilm?.(picked);
            combobox.closeDropdown();
            return;
          }
          const fallbackLabel = val.slice("film:".length);
          onChange(fallbackLabel);
          combobox.closeDropdown();
          return;
        }
        if (val.startsWith("tmdb:")) {
          const tmdbId = Number(val.slice("tmdb:".length));
          const picked = tmdbResults.find((r) => r.tmdb_id === tmdbId);
          if (!picked) return;
          if (picked.linked_film_id) {
            onSelectFilm?.({
              id: picked.linked_film_id,
              title: picked.linked_film_title ?? picked.title,
              release_year: picked.release_year,
              tmdb_id: picked.tmdb_id
            });
            onChange(
              formatFilmTitleWithYear(
                picked.linked_film_title ?? picked.title,
                picked.release_year
              )
            );
            setMode("local");
            combobox.closeDropdown();
            return;
          }
          onSelectTmdbCandidate({
            tmdb_id: picked.tmdb_id,
            title: picked.title,
            release_year: picked.release_year
          });
          onChange(formatFilmTitleWithYear(picked.title, picked.release_year));
          setMode("local");
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
        <Combobox.Options className="fo-filmComboboxResults">
          {mode === "local" ? (
            data.length === 0 ? (
              <Combobox.Empty>
                <Text size="sm" className="muted">
                  No matching films
                </Text>
              </Combobox.Empty>
            ) : (
              data.map((f) => (
                <Combobox.Option key={f.id} value={`film:${f.id}`}>
                  <Text size="sm">{f.label}</Text>
                </Combobox.Option>
              ))
            )
          ) : tmdbLoading ? (
            <Combobox.Empty>
              <Text size="sm" className="muted">
                Searching TMDB...
              </Text>
            </Combobox.Empty>
          ) : tmdbResults.length === 0 ? (
            <Combobox.Empty>
              <Text size="sm" className="muted">
                No TMDB matches
              </Text>
            </Combobox.Empty>
          ) : (
            tmdbResults.map((r) => (
              <Combobox.Option key={`tmdb-${r.tmdb_id}`} value={`tmdb:${r.tmdb_id}`}>
                <Group gap="sm" align="flex-start" wrap="nowrap">
                  <Image
                    src={r.poster_url}
                    alt=""
                    className="fo-filmSearchPoster"
                    radius="sm"
                  />
                  <Stack gap="var(--fo-space-4)" className="fo-flex1Minw0">
                    <Text size="sm" fw="var(--fo-font-weight-semibold)" lineClamp={1}>
                      {r.title}
                    </Text>
                    <Text size="xs" className="muted">
                      {r.release_year ?? "Year unknown"}
                      {r.director ? ` · ${r.director}` : ""}
                    </Text>
                    {r.original_title && r.original_title !== r.title ? (
                      <Text size="xs" className="muted" lineClamp={1}>
                        Original title: {r.original_title}
                      </Text>
                    ) : null}
                    {r.linked_film_id ? (
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        Already linked to:{" "}
                        {r.linked_film_title ?? `Film #${r.linked_film_id}`}
                      </Text>
                    ) : null}
                  </Stack>
                </Group>
              </Combobox.Option>
            ))
          )}
        </Combobox.Options>
        {mode === "local" && value.trim() ? (
          <Combobox.Options className="fo-filmComboboxEscape">
            <Combobox.Option value={`mode:tmdb:${value.trim()}`}>
              <Text size="sm" fw="var(--fo-font-weight-bold)">
                Create film: {value.trim()}
              </Text>
            </Combobox.Option>
          </Combobox.Options>
        ) : null}
        {mode === "tmdb" && value.trim() ? (
          <Combobox.Options className="fo-filmComboboxEscape">
            <Combobox.Option value={`create-unlinked:${value.trim()}`}>
              <Text size="sm" fw="var(--fo-font-weight-bold)">
                Create unlinked film: {value.trim()}
              </Text>
            </Combobox.Option>
          </Combobox.Options>
        ) : null}
      </Combobox.Dropdown>
    </Combobox>
  );
}
