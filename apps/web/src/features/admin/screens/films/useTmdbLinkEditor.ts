import { useEffect, useState } from "react";
import { useCombobox } from "@ui";
import { notify } from "@/notifications";
import { normalizeFilmTitleForTmdbQuery } from "@/lib/films";
import { isSearchableTmdbQuery, parseTmdbIdInput } from "@/decisions/films/filmGroups";
import type {
  AdminFilmRow,
  TmdbFilmSearchResult
} from "@/orchestration/admin/filmsIndex/orchestration";

export type LinkEditFilm = {
  id: number;
  title: string;
  tmdb_id: number | null;
};

/** Screen-level state for the "Link film to TMDB" modal and its debounced search. */
export function useTmdbLinkEditor(args: {
  onSearchTmdb: (
    q: string
  ) => Promise<
    { ok: true; results: TmdbFilmSearchResult[] } | { ok: false; error: string }
  >;
  onSaveTmdbId: (filmId: number, tmdbId: number | null) => Promise<{ ok: boolean }>;
}) {
  const { onSearchTmdb, onSaveTmdbId } = args;

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption()
  });
  const [editingFilm, setEditingFilm] = useState<LinkEditFilm | null>(null);
  const [tmdbInput, setTmdbInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<TmdbFilmSearchResult[]>([]);

  useEffect(() => {
    if (!editingFilm) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    const q = searchQuery.trim();
    if (!isSearchableTmdbQuery(q)) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      void onSearchTmdb(q).then((res) => {
        if (cancelled) return;
        setSearchLoading(false);
        if (!res.ok) {
          setSearchResults([]);
          return;
        }
        setSearchResults(res.results);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [editingFilm, onSearchTmdb, searchQuery]);

  const openFor = (film: AdminFilmRow) => {
    setEditingFilm({ id: film.id, title: film.title, tmdb_id: film.tmdb_id });
    setTmdbInput(film.tmdb_id ? String(film.tmdb_id) : "");
    setSearchQuery(normalizeFilmTitleForTmdbQuery(film.title));
  };

  const close = () => {
    setEditingFilm(null);
    setSearchQuery("");
    setSearchResults([]);
  };

  const changeSearchQuery = (next: string) => {
    setSearchQuery(next);
    const trimmed = next.trim();
    if (/^[0-9]+$/.test(trimmed)) {
      setTmdbInput(trimmed);
    } else {
      setTmdbInput("");
    }
    combobox.openDropdown();
  };

  const pickResult = (value: string) => {
    const picked = searchResults.find((r) => String(r.tmdb_id) === value);
    if (!picked) return;
    if (
      picked.linked_film_id &&
      editingFilm &&
      picked.linked_film_id !== editingFilm.id
    ) {
      notify({
        id: `admin_films_link_search_linked_${picked.tmdb_id}`,
        severity: "warning",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        title: "Already linked",
        message: picked.linked_film_title
          ? `TMDB ${picked.tmdb_id} is already linked to ${picked.linked_film_title}.`
          : `TMDB ${picked.tmdb_id} is already linked.`
      });
      return;
    }
    setTmdbInput(String(picked.tmdb_id));
    setSearchQuery(picked.title);
    combobox.closeDropdown();
  };

  const afterSave = (res: { ok: boolean }) => {
    if (!res.ok) return;
    setEditingFilm(null);
    setTmdbInput("");
    setSearchQuery("");
    setSearchResults([]);
  };

  const removeLink = () => {
    if (!editingFilm) return;
    void onSaveTmdbId(editingFilm.id, null).then(afterSave);
  };

  const save = () => {
    if (!editingFilm) return;
    const parsed = parseTmdbIdInput(tmdbInput);
    if (!parsed.valid) {
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
    void onSaveTmdbId(editingFilm.id, parsed.tmdbId).then(afterSave);
  };

  return {
    combobox,
    editingFilm,
    tmdbInput,
    searchQuery,
    searchLoading,
    searchResults,
    openFor,
    close,
    changeSearchQuery,
    pickResult,
    removeLink,
    save
  };
}
