import type {
  AreaDraft,
  DraftDraft,
  EventsDraft,
  FullSeasonSettings,
  RosterDraft,
  ScoringDraft,
  SettingsArea,
  SettingsCategory,
  SettingsEvent
} from "@/decisions/fullSeasonSettings";
import type { ApiResult } from "@/lib/types";
import { DraftModal } from "./DraftModal";
import { EventsModal } from "./EventsModal";
import { RosterModal } from "./RosterModal";
import { ScoringModal } from "./ScoringModal";
import type { SettingsModalFrameMode } from "./SettingsModal";

/** The open modal's state, as the screen's settings hook holds it. */
export type OpenSettingsModal = {
  area: SettingsArea;
  mode: SettingsModalFrameMode;
  draft: AreaDraft;
  errors: Record<string, string>;
  dirty: boolean;
  saving: boolean;
  status: ApiResult | null;
  announcement: string;
};

/**
 * The four settings modals; at most one is open. Render them outside any page
 * form: a modal's form is in a portal, but React still bubbles its submit.
 */
export function FullSeasonSettingsModals(props: {
  session: OpenSettingsModal | null;
  settings: FullSeasonSettings;
  events: readonly SettingsEvent[];
  categories: readonly SettingsCategory[];
  phone: boolean;
  onChange: (draft: AreaDraft, key?: string) => void;
  onBlur: (key: string) => void;
  onReset: () => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { session, settings, events, categories, phone } = props;
  const common = (area: SettingsArea) => {
    const active = session?.area === area ? session : null;
    return {
      opened: Boolean(active),
      phone,
      mode: active?.mode ?? "view",
      dirty: active?.dirty ?? false,
      saving: active?.saving ?? false,
      status: active?.status ?? null,
      announcement: active?.announcement ?? "",
      errors: active?.errors ?? {},
      saved: settings,
      onClose: props.onClose,
      onReset: props.onReset,
      onSubmit: props.onSubmit,
      onBlur: props.onBlur
    };
  };
  const draftOf = <D,>(area: SettingsArea) =>
    session?.area === area ? (session.draft as D) : null;

  return (
    <>
      <EventsModal
        {...common("events")}
        events={events}
        draft={draftOf<EventsDraft>("events")}
        onChange={props.onChange}
      />
      <ScoringModal
        {...common("scoring")}
        categories={categories}
        draft={draftOf<ScoringDraft>("scoring")}
        onChange={props.onChange}
      />
      <RosterModal
        {...common("roster")}
        categories={categories}
        draft={draftOf<RosterDraft>("roster")}
        onChange={props.onChange}
      />
      <DraftModal
        {...common("draft")}
        draft={draftOf<DraftDraft>("draft")}
        onChange={props.onChange}
      />
    </>
  );
}
