import { useCallback, useMemo, useState } from "react";
import type { SeasonDraftSettingsDraft } from "@/features/seasons/ui/modals/SeasonDraftSettingsModal";

export function useSeasonDraftSettingsModal(args: {
  scoringStrategy: string | null;
  allocationStrategy: string | null;
  pickTimerSeconds: number | null;
  updateScoring: (
    strategy: "fixed" | "negative" | "category_weighted"
  ) => Promise<unknown>;
  updateAllocation: (strategy: "UNDRAFTED" | "FULL_POOL") => Promise<unknown>;
  updateTimerWith: (seconds: number | null) => Promise<unknown>;
}) {
  const {
    scoringStrategy,
    allocationStrategy,
    pickTimerSeconds,
    updateScoring,
    updateAllocation,
    updateTimerWith
  } = args;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<SeasonDraftSettingsDraft | null>(
    null
  );

  const draftDefaults = useMemo(() => {
    const scoring = (scoringStrategy ?? "fixed") as
      | "fixed"
      | "negative"
      | "category_weighted";
    const allocation = (allocationStrategy ?? "UNDRAFTED") as "UNDRAFTED" | "FULL_POOL";
    const timerEnabled = Boolean(pickTimerSeconds);
    const resolvedTimerSeconds = pickTimerSeconds ? Number(pickTimerSeconds) : 60;
    return { scoring, allocation, timerEnabled, pickTimerSeconds: resolvedTimerSeconds };
  }, [allocationStrategy, pickTimerSeconds, scoringStrategy]);

  const openSettingsModal = useCallback(() => {
    setSettingsDraft({
      scoringStrategy: draftDefaults.scoring,
      allocationStrategy: draftDefaults.allocation,
      timerEnabled: draftDefaults.timerEnabled,
      pickTimerSeconds: draftDefaults.pickTimerSeconds
    });
    setSettingsOpen(true);
  }, [draftDefaults]);

  const saveDraftSettings = useCallback(
    async (draft: SeasonDraftSettingsDraft) => {
      const nextTimerSeconds = draft.timerEnabled ? draft.pickTimerSeconds : null;

      const dirty =
        draft.scoringStrategy !== draftDefaults.scoring ||
        draft.allocationStrategy !== draftDefaults.allocation ||
        (draftDefaults.timerEnabled ? draftDefaults.pickTimerSeconds : null) !==
          nextTimerSeconds;

      if (!dirty) {
        setSettingsOpen(false);
        setSettingsDraft(null);
        return;
      }

      if (draft.scoringStrategy !== draftDefaults.scoring) {
        await updateScoring(draft.scoringStrategy);
      }
      if (draft.allocationStrategy !== draftDefaults.allocation) {
        await updateAllocation(draft.allocationStrategy);
      }
      await updateTimerWith(nextTimerSeconds);

      setSettingsOpen(false);
      setSettingsDraft(null);
    },
    [draftDefaults, updateAllocation, updateScoring, updateTimerWith]
  );

  return {
    settingsOpen,
    setSettingsOpen,
    settingsDraft,
    setSettingsDraft,
    draftDefaults,
    openSettingsModal,
    saveDraftSettings
  };
}
