import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import type { PersonSearchRow } from "./types";

/** Debounced people search used when picking contributors. */
export function usePeopleSearch() {
  const [peopleQuery, setPeopleQuery] = useState("");
  const [peopleResults, setPeopleResults] = useState<PersonSearchRow[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleState, setPeopleState] = useState<ApiResult | null>(null);

  const searchPeople = useCallback(async () => {
    const q = peopleQuery.trim();
    if (!q) {
      setPeopleResults([]);
      setPeopleLoading(false);
      setPeopleState(null);
      return;
    }
    setPeopleLoading(true);
    setPeopleState(null);
    const res = await fetchJson<{
      people: Array<{
        id: number;
        full_name: string;
        tmdb_id: number | null;
        profile_url?: string | null;
      }>;
    }>(q ? `/admin/people?q=${encodeURIComponent(q)}` : `/admin/people`, {
      method: "GET"
    });
    setPeopleLoading(false);
    if (!res.ok) {
      setPeopleResults([]);
      setPeopleState({ ok: false, message: res.error ?? "Failed to load people" });
      return;
    }
    setPeopleResults(res.data?.people ?? []);
    setPeopleState({ ok: true, message: "Loaded" });
  }, [peopleQuery]);

  useEffect(() => {
    const q = peopleQuery.trim();
    if (!q) {
      setPeopleResults([]);
      setPeopleLoading(false);
      setPeopleState(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchPeople();
    }, 250);
    return () => {
      window.clearTimeout(timer);
    };
  }, [peopleQuery, searchPeople]);

  return {
    peopleQuery,
    setPeopleQuery,
    peopleResults,
    peopleLoading,
    peopleState,
    searchPeople
  };
}
