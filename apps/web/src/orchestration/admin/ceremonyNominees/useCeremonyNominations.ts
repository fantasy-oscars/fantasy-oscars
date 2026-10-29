import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { reorderNominationsLocally } from "../../../decisions/admin/nomineeLists";
import type { NominationRow } from "./types";
import {
  deleteNominationContributor as deleteNominationContributorReq,
  patchNominationContributorDisplay as patchNominationContributorDisplayReq,
  postNominationContributor as postNominationContributorReq
} from "./actions";

/** The ceremony's nomination list: loading, deleting, reordering and contributor edits. */
export function useCeremonyNominations(args: {
  ceremonyId: number | null;
  active: boolean;
  onWorksheetChange: (() => void | Promise<void>) | null;
  setManualLoading: (loading: boolean) => void;
  setManualState: (state: ApiResult | null) => void;
}) {
  const { ceremonyId, active, onWorksheetChange, setManualLoading, setManualState } =
    args;

  const [nominations, setNominations] = useState<NominationRow[]>([]);
  const [nominationsLoading, setNominationsLoading] = useState(false);
  const [nominationsState, setNominationsState] = useState<ApiResult | null>(null);

  const loadNominations = useCallback(async () => {
    if (ceremonyId === null || !Number.isFinite(ceremonyId) || ceremonyId <= 0) return;
    setNominationsLoading(true);
    setNominationsState(null);
    const res = await fetchJson<{ nominations: NominationRow[] }>(
      `/admin/ceremonies/${ceremonyId}/nominations`,
      { method: "GET" }
    );
    setNominationsLoading(false);
    if (!res.ok) {
      setNominationsState({
        ok: false,
        message: res.error ?? "Failed to load nominations"
      });
      return;
    }
    setNominations(res.data?.nominations ?? []);
    setNominationsState({ ok: true, message: "Loaded" });
  }, [ceremonyId]);

  const deleteNomination = useCallback(
    async (nominationId: number) => {
      setNominationsLoading(true);
      setNominationsState(null);
      const res = await fetchJson(`/admin/nominations/${nominationId}`, {
        method: "DELETE"
      });
      setNominationsLoading(false);
      if (!res.ok) {
        setNominationsState({
          ok: false,
          message: res.error ?? "Failed to delete nomination"
        });
        return;
      }
      setNominations((prev) => prev.filter((n) => n.id !== nominationId));
      setNominationsState({ ok: true, message: "Deleted" });
      // Wizard progression depends on ceremony stats; keep them in sync.
      void onWorksheetChange?.();
    },
    [onWorksheetChange]
  );

  const reorderNominationsInCategory = useCallback(
    async (categoryEditionId: number, orderedNominationIds: number[]) => {
      if (ceremonyId === null || !Number.isFinite(ceremonyId) || ceremonyId <= 0) return;
      setNominations((prev) =>
        reorderNominationsLocally(prev, categoryEditionId, orderedNominationIds)
      );

      setNominationsLoading(true);
      setNominationsState(null);
      const res = await fetchJson(`/admin/ceremonies/${ceremonyId}/nominations/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_edition_id: categoryEditionId,
          nomination_ids: orderedNominationIds
        })
      });
      setNominationsLoading(false);
      if (!res.ok) {
        setNominationsState({
          ok: false,
          message: res.error ?? "Failed to reorder nominations"
        });
        void loadNominations();
        return;
      }
      setNominationsState({ ok: true, message: "Reordered" });
    },
    [ceremonyId, loadNominations]
  );

  useEffect(() => {
    if (!active) return;
    void loadNominations();
  }, [active, loadNominations]);

  const addNominationContributor = useCallback(
    async (
      nominationId: number,
      input: { person_id?: number; name?: string; tmdb_id?: number }
    ) => {
      setManualLoading(true);
      setManualState(null);
      const res = await postNominationContributorReq(nominationId, input);
      setManualLoading(false);
      if (!res.ok) {
        setManualState({ ok: false, message: res.error ?? "Failed to add contributor" });
        return false;
      }
      setManualState({ ok: true, message: "Contributor added" });
      await loadNominations();
      return true;
    },
    [loadNominations, setManualLoading, setManualState]
  );

  const removeNominationContributor = useCallback(
    async (nominationId: number, nominationContributorId: number) => {
      setManualLoading(true);
      setManualState(null);
      const res = await deleteNominationContributorReq(
        nominationId,
        nominationContributorId
      );
      setManualLoading(false);
      if (!res.ok) {
        setManualState({
          ok: false,
          message: res.error ?? "Failed to remove contributor"
        });
        return false;
      }
      setManualState({ ok: true, message: "Contributor removed" });
      await loadNominations();
      return true;
    },
    [loadNominations, setManualLoading, setManualState]
  );

  const updateNominationContributorDisplay = useCallback(
    async (
      nominationId: number,
      nominationContributorId: number,
      input: {
        display_name_override?: string | null;
        display_role_override?: string | null;
        avatar_person_id_override?: number | null;
      }
    ) => {
      setManualLoading(true);
      setManualState(null);
      const res = await patchNominationContributorDisplayReq(
        nominationId,
        nominationContributorId,
        input
      );
      setManualLoading(false);
      if (!res.ok) {
        setManualState({
          ok: false,
          message: res.error ?? "Failed to update contributor display settings"
        });
        return false;
      }
      setManualState({ ok: true, message: "Contributor display updated" });
      await loadNominations();
      return true;
    },
    [loadNominations, setManualLoading, setManualState]
  );

  return {
    nominations,
    nominationsLoading,
    nominationsState,
    loadNominations,
    deleteNomination,
    reorderNominationsInCategory,
    addNominationContributor,
    removeNominationContributor,
    updateNominationContributorDisplay
  };
}
