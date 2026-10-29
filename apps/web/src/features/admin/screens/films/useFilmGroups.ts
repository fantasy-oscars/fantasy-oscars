import { useMemo, useState } from "react";
import {
  buildFilmDisplayRows,
  findOpenGroup,
  groupFilmsByNormTitle,
  pageGroupFilms,
  type FilmDisplayRow
} from "@/decisions/films/filmGroups";
import type { AdminFilmRow } from "@/orchestration/admin/filmsIndex/orchestration";

/** Screen-level state for duplicate groups: display rows, decoupling and the group modal. */
export function useFilmGroups(films: AdminFilmRow[]) {
  const [decoupledFilmIds, setDecoupledFilmIds] = useState<Record<number, true>>({});
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);
  const [groupPage, setGroupPage] = useState(1);

  const groupsByNormTitle = useMemo(() => groupFilmsByNormTitle(films), [films]);

  const displayRows = useMemo<FilmDisplayRow<AdminFilmRow>[]>(
    () => buildFilmDisplayRows(groupsByNormTitle, decoupledFilmIds),
    [decoupledFilmIds, groupsByNormTitle]
  );

  const openGroup = useMemo(
    () => findOpenGroup(displayRows, openGroupKey),
    [displayRows, openGroupKey]
  );

  const {
    pageCount: groupPageCount,
    clampedPage: clampedGroupPage,
    pageFilms: pagedGroupFilms
  } = useMemo(
    () => pageGroupFilms(openGroup?.films ?? [], groupPage),
    [groupPage, openGroup]
  );

  const openGroupModal = (normTitle: string) => {
    setOpenGroupKey(normTitle);
    setGroupPage(1);
  };

  const closeGroupModal = () => setOpenGroupKey(null);

  const decouple = (filmId: number) => {
    setDecoupledFilmIds((prev) => ({ ...prev, [filmId]: true }));
  };

  const previousGroupPage = () => setGroupPage((p) => Math.max(1, p - 1));
  const nextGroupPage = () => setGroupPage((p) => Math.min(groupPageCount, p + 1));

  return {
    displayRows,
    openGroup,
    groupPageCount,
    clampedGroupPage,
    pagedGroupFilms,
    openGroupModal,
    closeGroupModal,
    decouple,
    previousGroupPage,
    nextGroupPage
  };
}
