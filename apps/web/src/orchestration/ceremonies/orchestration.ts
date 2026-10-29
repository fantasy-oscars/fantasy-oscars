import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "../../lib/api";
import {
  sortNewestFirst,
  splitActiveArchived
} from "../../decisions/ceremonies/ceremonyIndex";
import { ApiQueryError, errorMessage, errorRequestId, unwrap } from "../query/errors";
import { queryKeys } from "../query/keys";
import { ceremoniesListQuery } from "../query/queries";

export type CeremonyIndexRow = {
  id: number;
  code: string | null;
  name: string | null;
  starts_at: string | null;
  status: "PUBLISHED" | "LOCKED" | "COMPLETE" | "ARCHIVED";
};

type LoadState = "loading" | "error" | "ready";

export function useCeremoniesIndexOrchestration() {
  const query = useQuery(ceremoniesListQuery());

  const rows = useMemo<CeremonyIndexRow[]>(
    () =>
      (query.data ?? []).map((c) => ({
        id: c.id,
        code: c.code ?? null,
        name: c.name ?? null,
        starts_at: c.starts_at ?? null,
        status: c.status as CeremonyIndexRow["status"]
      })),
    [query.data]
  );

  const state: LoadState = query.data ? "ready" : query.isError ? "error" : "loading";
  const error = query.isError
    ? errorMessage(query.error, "Failed to load ceremonies")
    : null;
  const requestId = query.isError ? errorRequestId(query.error) : undefined;

  const { refetch } = query;
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const { active, archived } = useMemo(() => {
    return splitActiveArchived(sortNewestFirst(rows));
  }, [rows]);

  return { state, error, requestId, active, archived, refresh };
}

export type CeremonyDetail = {
  ceremony: {
    id: number;
    code: string | null;
    name: string | null;
    starts_at: string | null;
    status: "PUBLISHED" | "LOCKED" | "COMPLETE" | "ARCHIVED";
  };
  categories: Array<{
    id: number;
    unit_kind: string;
    sort_index: number;
    family_name: string;
    icon_code: string | null;
    icon_variant: "default" | "inverted";
  }>;
  nominations: Array<{
    id: number;
    category_edition_id: number;
    label: string;
    status: string;
    film_title?: string | null;
    film_poster_url?: string | null;
    film_year?: number | null;
    contributors?: string[];
    song_title?: string | null;
    performer_name?: string | null;
    performer_character?: string | null;
    performer_profile_url?: string | null;
    performer_profile_path?: string | null;
  }>;
  winners: Array<{ category_edition_id: number; nomination_id: number }>;
};

export function useCeremonyDetailOrchestration(args: { ceremonyId: number | null }) {
  const { ceremonyId } = args;
  const validId = Boolean(ceremonyId && Number.isFinite(ceremonyId) && ceremonyId > 0);

  const query = useQuery({
    queryKey: queryKeys.ceremonies.detail(ceremonyId ?? 0),
    enabled: validId,
    queryFn: async (): Promise<CeremonyDetail> => {
      const data = unwrap(
        await fetchJson<CeremonyDetail>(`/ceremonies/${ceremonyId}`, { method: "GET" }),
        "Failed to load ceremony"
      );
      if (!data) throw new ApiQueryError("Failed to load ceremony");
      return data;
    }
  });

  let state: LoadState = "loading";
  let error: string | null = null;
  let requestId: string | undefined;
  if (!validId) {
    state = "error";
    error = "Invalid ceremony id";
  } else if (query.data) {
    state = "ready";
    if (query.isError) error = errorMessage(query.error, "Failed to load ceremony");
  } else if (query.isError) {
    state = "error";
    error = errorMessage(query.error, "Failed to load ceremony");
    requestId = errorRequestId(query.error);
  }

  const { refetch } = query;
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    state,
    error,
    requestId,
    detail: validId ? (query.data ?? null) : null,
    refresh
  };
}
