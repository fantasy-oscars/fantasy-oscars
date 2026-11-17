import { NumberInput, Stack, Switch, Text } from "@ui";
import { CIRCUIT_LEAGUE_LIMITS as LIMITS } from "@fantasy-oscars/shared/schemas";
import { onOffLabel, pickClockLabel } from "@/decisions/circuitLeague";
import type { DraftDraft, FullSeasonSettings } from "@/decisions/fullSeasonSettings";
import { ReadOnlyRows } from "./ReadOnlyRows";
import { settingsFieldId } from "./dom";
import { SettingsModal, frameProps, type AreaModalProps } from "./SettingsModal";

/** The pick timer and auto-draft; the draft itself is always snake. */
export function DraftModal(
  props: AreaModalProps & {
    draft: DraftDraft | null;
    saved: FullSeasonSettings;
    onChange: (draft: DraftDraft, key?: string) => void;
  }
) {
  const { draft, saved, errors, mode, saving } = props;
  const readOnly = mode === "view";
  const d: DraftDraft = draft ?? {
    timerEnabled: saved.pickTimerSeconds !== null,
    pickTimerSeconds: saved.pickTimerSeconds ?? "",
    autoDraftEnabled: saved.autoDraftEnabled
  };
  const set = (patch: Partial<DraftDraft>, key?: string) => {
    // While saving, fields stay focusable but do not change.
    if (saving) return;
    props.onChange({ ...d, ...patch }, key);
  };

  return (
    <SettingsModal {...frameProps(props)} title="Draft" size="md">
      {readOnly ? (
        <ReadOnlyRows
          rows={[
            { key: "type", label: "Draft", value: "Snake" },
            {
              key: "clock",
              label: "Pick timer",
              value: pickClockLabel(saved.pickTimerSeconds)
            },
            {
              key: "auto",
              label: "Auto-draft",
              value: onOffLabel(saved.autoDraftEnabled)
            }
          ]}
        />
      ) : (
        <>
          <Text className="baseline-textBody">
            Snake draft: the order reverses each round.
          </Text>
          <Stack gap="xs" align="flex-start">
            <Switch
              id={settingsFieldId("timerEnabled")}
              label="Pick timer"
              checked={d.timerEnabled}
              data-autofocus
              onChange={(e) =>
                set({ timerEnabled: e.currentTarget.checked }, "pickTimerSeconds")
              }
            />
            <NumberInput
              hideControls
              id={settingsFieldId("pickTimerSeconds")}
              label="Seconds per pick"
              description="Up to 86,400 (one day)."
              inputMode="numeric"
              allowDecimal={false}
              allowNegative={false}
              clampBehavior="none"
              min={1}
              max={LIMITS.pickTimerSeconds.max}
              step={5}
              value={d.pickTimerSeconds}
              error={errors.pickTimerSeconds}
              disabled={!d.timerEnabled}
              readOnly={saving}
              maw="var(--fo-layout-fieldBasis-sm)"
              w="100%"
              onChange={(v) => set({ pickTimerSeconds: v }, "pickTimerSeconds")}
              onBlur={() => props.onBlur("pickTimerSeconds")}
            />
          </Stack>
          <Switch
            label="Auto-draft"
            description="When a player’s clock runs out, pick the next contender from their queue."
            checked={d.autoDraftEnabled}
            onChange={(e) => set({ autoDraftEnabled: e.currentTarget.checked })}
          />
        </>
      )}
    </SettingsModal>
  );
}
