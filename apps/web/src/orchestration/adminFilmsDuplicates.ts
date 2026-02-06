import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../lib/api";
import { notify } from "../notifications/notify";

export type AdminFilmDupe = {
  id: number;
  title: string;
  release_year: number | null;
  tmdb_id: number | null;
  poster_url: string | null;
  tmdb_last_synced_at: string | null;
};

export type AdminFilmDuplicateGroup = {
  norm_title: string;
  count: number;
  films: AdminFilmDupe[];
};

export function useAdminFilmDuplicatesOrchestration() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ ok: true } | { ok: false; message: string } | null>(
    null
  );
  const [groups, setGroups] = useState<AdminFilmDuplicateGroup[]>([]);

  // UI state: which film is treated as canonical in each group.
  const [canonicalByGroup, setCanonicalByGroup] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    const q = query.trim();
    const path = q ? `/admin/films/duplicates?q=${encodeURIComponent(q)}` : "/admin/films/duplicates";
    const res = await fetchJson<{ groups: AdminFilmDuplicateGroup[] }>(path, {
      method: "GET"
    });
    setLoading(false);
    if (!res.ok) {
      setGroups([]);
      setStatus({ ok: false, message: res.error ?? "Failed to load duplicates" });
      return;
    }
    const nextGroups = res.data?.groups ?? [];
    setGroups(nextGroups);
    setStatus({ ok: true });
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Default canonical choice: prefer the TMDB-linked film; otherwise the first film.
    // Preserve any existing selection when possible.
    setCanonicalByGroup((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        const existing = next[g.norm_title];
        if (existing && g.films.some((f) => f.id === existing)) continue;
        const linked = g.films.find((f) => typeof f.tmdb_id === "number" && f.tmdb_id);
        next[g.norm_title] = linked?.id ?? g.films[0]?.id ?? 0;
      }
      return next;
    });
  }, [groups]);

  const setCanonicalForGroup = useCallback((normTitle: string, filmId: number) => {
    setCanonicalByGroup((prev) => ({ ...prev, [normTitle]: filmId }));
  }, []);

  const mergeIntoCanonical = useCallback(
    async (canonicalId: number, duplicateIds: number[]) => {
      const res = await fetchJson<{
        ok: true;
        counts: Record<string, number>;
        canonical: { id: number; title: string };
      }>(`/admin/films/${canonicalId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicate_ids: duplicateIds })
      });
      if (!res.ok) {
        notify({
          id: `admin_film_merge_failed_${canonicalId}`,
          severity: "error",
          trigger_type: "user_action",
          scope: "local",
          durability: "ephemeral",
          requires_decision: false,
          title: "Merge failed",
          message: res.error ?? "Unable to merge films."
        });
        return { ok: false as const, message: res.error ?? "Merge failed" };
      }
      notify({
        id: `admin_film_merge_ok_${canonicalId}`,
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Duplicates merged."
      });
      await load();
      return { ok: true as const };
    },
    [load]
  );

  const merged = useMemo(
    () => ({
      query,
      setQuery,
      loading,
      status,
      groups,
      canonicalByGroup,
      setCanonicalForGroup,
      reload: load,
      mergeIntoCanonical
    }),
    [
      query,
      setQuery,
      loading,
      status,
      groups,
      canonicalByGroup,
      setCanonicalForGroup,
      load,
      mergeIntoCanonical
    ]
  );

  return merged;
}

