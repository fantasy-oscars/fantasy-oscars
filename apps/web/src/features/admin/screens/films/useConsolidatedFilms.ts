import { useState } from "react";
import type {
  AdminFilmRow,
  ConsolidatedFilmRow
} from "@/orchestration/admin/filmsIndex/orchestration";

type LoadConsolidatedResult =
  | {
      ok: true;
      films: ConsolidatedFilmRow[];
      total: number;
      page: number;
      pageSize: number;
    }
  | { ok: false; error: string };

/** Screen-level state for the "Manage consolidated records" modal. */
export function useConsolidatedFilms(args: {
  onLoadConsolidated: (
    canonicalId: number,
    page: number,
    pageSize: number
  ) => Promise<LoadConsolidatedResult>;
  onDecoupleConsolidated: (
    canonicalId: number,
    filmId: number
  ) => Promise<{ ok: boolean }>;
}) {
  const { onLoadConsolidated, onDecoupleConsolidated } = args;

  const [modalFilm, setModalFilm] = useState<AdminFilmRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ConsolidatedFilmRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [total, setTotal] = useState(0);
  const [decouplingFilmId, setDecouplingFilmId] = useState<number | null>(null);

  const load = (canonicalFilm: AdminFilmRow, nextPage = 1) => {
    setModalFilm(canonicalFilm);
    setLoading(true);
    void onLoadConsolidated(canonicalFilm.id, nextPage, pageSize).then((res) => {
      setLoading(false);
      if (!res.ok) return;
      setRows(res.films);
      setTotal(res.total);
      setPage(res.page);
      setPageSize(res.pageSize);
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));

  const close = () => {
    if (loading || decouplingFilmId) return;
    setModalFilm(null);
    setRows([]);
    setTotal(0);
    setPage(1);
  };

  const decouple = (filmId: number) => {
    if (!modalFilm) return;
    setDecouplingFilmId(filmId);
    void onDecoupleConsolidated(modalFilm.id, filmId).then((res) => {
      setDecouplingFilmId(null);
      if (!res.ok) return;
      load(modalFilm, page);
    });
  };

  const previousPage = () => {
    if (!modalFilm) return;
    load(modalFilm, Math.max(1, page - 1));
  };

  const nextPage = () => {
    if (!modalFilm) return;
    load(modalFilm, Math.min(totalPages, page + 1));
  };

  return {
    modalFilm,
    loading,
    rows,
    page,
    total,
    totalPages,
    decouplingFilmId,
    load,
    close,
    decouple,
    previousPage,
    nextPage
  };
}
