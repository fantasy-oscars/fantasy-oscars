import { Alert, NumberInput, Stack, Text } from "@ui";
import { CIRCUIT_LEAGUE_LIMITS as LIMITS } from "@fantasy-oscars/shared/schemas";
import { AlertIcon } from "@/shared/AlertIcon";
import {
  rosterDraftShortfall,
  type FullSeasonSettings,
  type RosterDraft,
  type SettingsCategory
} from "@/decisions/fullSeasonSettings";
import { categoryLimitValue, limitedMeta } from "@/decisions/fullSeasonSummary";
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

/** Roster size, and the most contenders one player may hold per category. */
export function RosterModal(
  props: AreaModalProps & {
    categories: readonly SettingsCategory[];
    draft: RosterDraft | null;
    saved: FullSeasonSettings;
    onChange: (draft: RosterDraft, key?: string) => void;
  }
) {
  const { categories, draft, saved, errors, mode, saving } = props;
  const readOnly = mode === "view";
  const d: RosterDraft = draft ?? { rosterSize: saved.rosterSize, limits: {} };
  const limited = categories.filter((c) =>
    readOnly
      ? saved.categories[c.id]?.maxOwned != null
      : String(d.limits[c.id] ?? "").trim() !== ""
  ).length;
  const shortfall = readOnly ? null : rosterDraftShortfall(d, categories);

  return (
    <SettingsModal {...frameProps(props)} title="Roster" size="lg">
      {readOnly ? null : (
        <Text variant="helper">
          How many contenders each player holds. The draft has one round per roster spot.
        </Text>
      )}
      {readOnly ? (
        <ReadOnlyRows
          rows={[
            { key: "roster", label: "Roster size", value: String(saved.rosterSize) }
          ]}
        />
      ) : (
        <NumberInput
          hideControls
          id={settingsFieldId("rosterSize")}
          label="Roster size"
          description={`From ${LIMITS.rosterSize.min} to ${LIMITS.rosterSize.max}.`}
          inputMode="numeric"
          allowDecimal={false}
          allowNegative={false}
          clampBehavior="none"
          min={LIMITS.rosterSize.min}
          max={LIMITS.rosterSize.max}
          value={d.rosterSize}
          error={errors.rosterSize}
          readOnly={saving}
          data-autofocus
          maw="var(--fo-layout-fieldBasis-sm)"
          onChange={(v) => props.onChange({ ...d, rosterSize: v }, "rosterSize")}
          onBlur={() => props.onBlur("rosterSize")}
        />
      )}
      {categories.length === 0 ? null : (
        <Stack gap="xs">
          <SettingsSectionHeading title="Category limits" meta={limitedMeta(limited)} />
          {readOnly ? (
            <ReadOnlyRows
              rows={categories.map((c) => ({
                key: c.id,
                label: c.name,
                value: categoryLimitValue(saved.categories[c.id]?.maxOwned ?? null)
              }))}
            />
          ) : (
            <>
              <Text variant="helper">
                The most contenders one player may hold in a category. Leave it empty for
                no limit.
              </Text>
              {shortfall ? (
                <Alert
                  color="yellow"
                  variant="light"
                  icon={<AlertIcon variant="warning" />}
                  role="status"
                >
                  These limits allow {shortfall.sum} contenders, fewer than the roster
                  size of {shortfall.size}.
                </Alert>
              ) : null}
              <SettingsColumnHeader label="Limit" />
              <Stack component="ul" gap="var(--fo-space-0)" className="fo-listReset">
                {categories.map((c, idx) => {
                  const key = `limit:${c.id}`;
                  return (
                    <SettingsListRow
                      key={c.id}
                      fieldKey={key}
                      left={
                        <Text className="baseline-textBody baseline-wrapAnywhere">
                          {c.name}
                        </Text>
                      }
                      ariaLabel={`${c.name} limit`}
                      placeholder="None"
                      value={d.limits[c.id] ?? ""}
                      error={errors[key]}
                      decimal={false}
                      min={LIMITS.maxOwned.min}
                      max={LIMITS.maxOwned.max}
                      readOnly={saving}
                      last={idx === categories.length - 1}
                      onChange={(v) =>
                        props.onChange({ ...d, limits: { ...d.limits, [c.id]: v } }, key)
                      }
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
