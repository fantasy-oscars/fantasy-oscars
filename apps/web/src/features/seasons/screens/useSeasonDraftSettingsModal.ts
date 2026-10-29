import { useCallback, useMemo, useState } from "react";
import type { SeasonDraftSettingsDraft } from "@/features/seasons/ui/modals/SeasonDraftSettingsModal";

export function useSeasonDraftSettingsModal(args: {
  scoringStrategy: string | null;
  allocationStrategy: string | null;
  pickTimerSeconds: number | null;
  updateScoring: (
    strategy: "fixed" | "negative" | "category_weighted"
  ) => Promise<boolean>;
  updateAllocation: (strategy: "UNDRAFTED" | "FULL_POOL") => Promise<boolean>;
  updateTimerWith: (seconds: number | null) => Promise<boolean>;
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
      "fixed" | "negative" | "category_weighted";
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

      // On a failed save the modal stays open so the message shows on its input.
      if (draft.scoringStrategy !== draftDefaults.scoring) {
        if (!(await updateScoring(draft.scoringStrategy))) return;
      }
      if (draft.allocationStrategy !== draftDefaults.allocation) {
        if (!(await updateAllocation(draft.allocationStrategy))) return;
      }
      const currentTimerSeconds = draftDefaults.timerEnabled
        ? draftDefaults.pickTimerSeconds
        : null;
      if (nextTimerSeconds !== currentTimerSeconds) {
        if (!(await updateTimerWith(nextTimerSeconds))) return;
      }

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
