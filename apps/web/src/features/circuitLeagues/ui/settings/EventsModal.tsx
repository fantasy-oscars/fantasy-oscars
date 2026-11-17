import { Alert, Stack, Switch, Text } from "@ui";
import { CIRCUIT_LEAGUE_LIMITS as LIMITS } from "@fantasy-oscars/shared/schemas";
import { AlertIcon } from "@/shared/AlertIcon";
import { EmptyState } from "@/primitives";
import {
  circuitLeagueEventDescription,
  circuitLeagueEventValue
} from "@/decisions/circuitLeague";
import type {
  EventsDraft,
  FullSeasonSettings,
  SettingsEvent
} from "@/decisions/fullSeasonSettings";
import { eventsOnMeta } from "@/decisions/fullSeasonSummary";
import { ReadOnlyRows } from "./ReadOnlyRows";
import { SettingsListRow } from "./SettingsListRow";
import { settingsFieldId } from "./dom";
import {
  SettingsColumnHeader,
  SettingsModal,
  SettingsSectionHeading,
  frameProps,
  type AreaModalProps
} from "./SettingsModal";

/** Which events count, and each one's weight. */
export function EventsModal(
  props: AreaModalProps & {
    events: readonly SettingsEvent[];
    draft: EventsDraft | null;
    saved: FullSeasonSettings;
    onChange: (draft: EventsDraft, key?: string) => void;
  }
) {
  const { events, draft, saved, errors, mode, saving } = props;
  const readOnly = mode === "view";
  const values = draft?.events ?? {};
  const on = events.filter((e) =>
    readOnly ? saved.events[e.id]?.enabled : values[e.id]?.enabled
  ).length;
  const setEvent = (
    id: number,
    patch: Partial<EventsDraft["events"][number]>,
    key?: string
  ) => {
    // While saving, fields stay focusable but do not change.
    if (saving) return;
    props.onChange({ events: { ...values, [id]: { ...values[id]!, ...patch } } }, key);
  };

  return (
    <SettingsModal {...frameProps(props)} title="Events" size="lg">
      {readOnly ? null : (
        <Text variant="helper">
          Choose which events count. A weight multiplies every point an event awards: 2
          doubles it, 0.5 halves it.
        </Text>
      )}
      {events.length === 0 ? (
        <EmptyState>This awards season has no events yet.</EmptyState>
      ) : (
        <Stack gap="xs">
          <SettingsSectionHeading title="Events" meta={eventsOnMeta(on, events.length)} />
          {readOnly ? (
            <ReadOnlyRows
              rows={events.map((e) => ({
                key: e.id,
                label: e.name,
                detail: circuitLeagueEventDescription(e),
                value: circuitLeagueEventValue({
                  enabled: saved.events[e.id]?.enabled ?? false,
                  weight: saved.events[e.id]?.weight ?? 1
                })
              }))}
            />
          ) : (
            <>
              {on === 0 ? (
                <Alert
                  color="yellow"
                  variant="light"
                  icon={<AlertIcon variant="warning" />}
                  role="status"
                >
                  No events are on, so nothing will score.
                </Alert>
              ) : null}
              <SettingsColumnHeader label="Weight" />
              <Stack component="ul" gap="var(--fo-space-0)" className="fo-listReset">
                {events.map((e, idx) => {
                  const f = values[e.id] ?? { enabled: false, weight: 1 };
                  const key = `event:${e.id}`;
                  return (
                    <SettingsListRow
                      key={e.id}
                      fieldKey={key}
                      left={
                        <Switch
                          id={settingsFieldId(`switch:${e.id}`)}
                          label={e.name}
                          description={circuitLeagueEventDescription(e)}
                          checked={f.enabled}
                          data-autofocus={idx === 0 ? true : undefined}
                          onChange={(ev) =>
                            setEvent(e.id, { enabled: ev.currentTarget.checked }, key)
                          }
                          classNames={{ label: "baseline-wrapAnywhere" }}
                        />
                      }
                      ariaLabel={`${e.name} weight`}
                      value={f.weight}
                      error={errors[key]}
                      decimal
                      min={0}
                      max={LIMITS.weight.max}
                      step={0.5}
                      disabled={!f.enabled}
                      readOnly={saving}
                      last={idx === events.length - 1}
                      onChange={(v) => setEvent(e.id, { weight: v }, key)}
                      onBlur={() => props.onBlur(key)}
                    />
                  );
                })}
              </Stack>
            </>
          )}
        </Stack>
      )}
    </SettingsModal>
  );
}
