import { useMediaQuery } from "@ui/hooks";
import type { LeagueSeasonCreateView } from "@/orchestration/seasons";
import {
  SETTINGS_AREAS,
  type AreaMode,
  type FullSeasonSettings,
  type SettingsArea
} from "@/decisions/fullSeasonSettings";
import { areaSummary } from "@/decisions/fullSeasonSummary";
import { SETTINGS_PHONE_QUERY } from "@/features/circuitLeagues/ui/settings/dom";
import { FullSeasonSettingsModals } from "@/features/circuitLeagues/ui/settings/FullSeasonSettingsModals";
import { useFullSeasonSettingsModals } from "@/features/circuitLeagues/screens/useFullSeasonSettingsModals";
import { FullSeasonForm } from "@/features/seasons/ui/create/FullSeasonForm";

type ReadyView = Extract<LeagueSeasonCreateView, { state: "ready" }>;

const ALL_EDIT: Record<SettingsArea, AreaMode> = {
  events: "edit",
  scoring: "edit",
  roster: "edit",
  draft: "edit"
};

/** Areas that need the awards season's events or categories. */
const NEEDS_OPTIONS = new Set<SettingsArea>(["events", "scoring", "roster"]);

const NO_EVENTS: never[] = [];

/**
 * The full awards season form and its modals. Modals apply locally; the
 * values go with the create request.
 */
export function FullSeasonCreateSection(props: {
  view: ReadyView;
  actions: {
    setFullCircuitId: (v: number | null) => void;
    resetFull: () => void;
    submitFull: () => void;
    retryFullOptions: () => void;
    applyFullArea: (area: SettingsArea, next: FullSeasonSettings) => { ok: true };
  };
}) {
  const { view, actions } = props;
  const phone = useMediaQuery(SETTINGS_PHONE_QUERY, false, {
    getInitialValueInEffect: false
  });
  const options = view.fullOptions;
  const events = options.state === "ready" ? options.events : NO_EVENTS;
  const categories = options.state === "ready" ? options.categories : NO_EVENTS;
  const modals = useFullSeasonSettingsModals({
    settings: view.fullSettings,
    events,
    categories,
    modes: ALL_EDIT,
    commit: "apply",
    onCommit: actions.applyFullArea
  });

  return (
    <>
      <FullSeasonForm
        openCircuits={view.openCircuits}
        circuitId={view.fullCircuitId}
        working={view.fullWorking}
        status={view.fullStatus}
        discarded={view.fullDiscarded}
        statusLine={modals.statusLine}
        optionsFailed={options.state === "error"}
        rows={SETTINGS_AREAS.map((area) => ({
          area,
          mode: "edit",
          state: !NEEDS_OPTIONS.has(area)
            ? "ready"
            : options.state === "loading"
              ? "loading"
              : options.state === "error"
                ? "unloaded"
                : "ready",
          summary: areaSummary(area, view.fullSettings, events, categories)
        }))}
        onChooseCircuit={actions.setFullCircuitId}
        onRetryOptions={actions.retryFullOptions}
        onOpen={modals.openArea}
        onReset={actions.resetFull}
        onSubmit={actions.submitFull}
      />
      <FullSeasonSettingsModals
        session={modals.session}
        settings={view.fullSettings}
        events={events}
        categories={categories}
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
