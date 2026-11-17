import { useMemo } from "react";
import { useMediaQuery } from "@ui/hooks";
import type { CircuitLeagueDetail } from "@/lib/types";
import type { AreaSaveResult } from "@/orchestration/circuitLeague";
import {
  SETTINGS_AREAS,
  fullSeasonAreaModes,
  fullSeasonSettingsHelper,
  type FullSeasonSettings,
  type SettingsArea
} from "@/decisions/fullSeasonSettings";
import { areaSummary } from "@/decisions/fullSeasonSummary";
import { FullSeasonSettingsCard } from "@/features/circuitLeagues/ui/settings/FullSeasonSettingsCard";
import { FullSeasonSettingsModals } from "@/features/circuitLeagues/ui/settings/FullSeasonSettingsModals";
import { SETTINGS_PHONE_QUERY } from "@/features/circuitLeagues/ui/settings/dom";
import { useFullSeasonSettingsModals } from "./useFullSeasonSettingsModals";

/** The season page's settings card and its modals; each modal saves its own area. */
export function FullSeasonSettingsSection(props: {
  detail: CircuitLeagueDetail;
  settings: FullSeasonSettings;
  onSave: (area: SettingsArea, next: FullSeasonSettings) => Promise<AreaSaveResult>;
}) {
  const { detail, settings } = props;
  const phone = useMediaQuery(SETTINGS_PHONE_QUERY, false, {
    getInitialValueInEffect: false
  });
  const status = detail.circuit_league.status;
  const canManage = detail.viewer.can_manage;
  const modes = useMemo(
    () => fullSeasonAreaModes({ status, canManage }),
    [status, canManage]
  );
  const modals = useFullSeasonSettingsModals({
    settings,
    events: detail.events,
    categories: detail.categories,
    modes,
    commit: "save",
    onCommit: props.onSave
  });

  return (
    <>
      <FullSeasonSettingsCard
        helper={fullSeasonSettingsHelper({ status, canManage })}
        statusLine={modals.statusLine}
        rows={SETTINGS_AREAS.map((area) => ({
          area,
          mode: modes[area],
          state: "ready",
          summary: areaSummary(area, settings, detail.events, detail.categories)
        }))}
        onOpen={modals.openArea}
      />
      <FullSeasonSettingsModals
        session={modals.session}
        settings={settings}
        events={detail.events}
        categories={detail.categories}
        phone={phone}
        onChange={modals.change}
        onBlur={modals.blur}
        onReset={modals.resetDefaults}
        onClose={modals.requestClose}
        onSubmit={modals.submit}
      />
    </>
  );
}
