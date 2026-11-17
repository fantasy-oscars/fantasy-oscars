import { Alert, NumberInput, SimpleGrid, Stack, Text } from "@ui";
import { CIRCUIT_LEAGUE_LIMITS as LIMITS } from "@fantasy-oscars/shared/schemas";
import { AlertIcon } from "@/shared/AlertIcon";
import type {
  FullSeasonSettings,
  ScoringDraft,
  SettingsCategory
} from "@/decisions/fullSeasonSettings";
import { categoryWeightValue, weightedMeta } from "@/decisions/fullSeasonSummary";
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

function isOne(value: number | string): boolean {
  return value !== "" && Number(value) === 1;
}

/** Points per nomination and win, and each category's weight. */
export function ScoringModal(
  props: AreaModalProps & {
    categories: readonly SettingsCategory[];
    draft: ScoringDraft | null;
    saved: FullSeasonSettings;
    onChange: (draft: ScoringDraft, key?: string) => void;
  }
) {
  const { categories, draft, saved, errors, mode, saving } = props;
  const readOnly = mode === "view";
  const d: ScoringDraft = draft ?? {
    nominationPoints: saved.nominationPoints,
    winBonusPoints: saved.winBonusPoints,
    weights: {}
  };
  const weighted = categories.filter((c) =>
    readOnly ? (saved.categories[c.id]?.weight ?? 1) !== 1 : !isOne(d.weights[c.id] ?? 1)
  ).length;
  const bothZero =
    d.nominationPoints !== "" &&
    d.winBonusPoints !== "" &&
    Number(d.nominationPoints) === 0 &&
    Number(d.winBonusPoints) === 0;
  const set = (patch: Partial<ScoringDraft>, key: string) =>
    props.onChange({ ...d, ...patch }, key);

  return (
    <SettingsModal {...frameProps(props)} title="Scoring" size="lg">
      {readOnly ? null : (
        <Text variant="helper">
          Picks score when they’re nominated or win at an event that counts. Points are
          multiplied by the event’s weight and the category’s weight.
        </Text>
      )}
      {readOnly ? (
        <ReadOnlyRows
          rows={[
            {
              key: "nomination",
              label: "Points per nomination",
              value: String(saved.nominationPoints)
            },
            { key: "win", label: "Points per win", value: String(saved.winBonusPoints) }
          ]}
        />
      ) : (
        <SimpleGrid cols={2} spacing="sm">
          <NumberInput
            hideControls
            id={settingsFieldId("nominationPoints")}
            label="Points per nomination"
            inputMode="numeric"
            allowDecimal={false}
            allowNegative={false}
            clampBehavior="none"
            min={LIMITS.points.min}
            max={LIMITS.points.max}
            value={d.nominationPoints}
            error={errors.nominationPoints}
            readOnly={saving}
            data-autofocus
            onChange={(v) => set({ nominationPoints: v }, "nominationPoints")}
            onBlur={() => props.onBlur("nominationPoints")}
          />
          <NumberInput
            hideControls
            id={settingsFieldId("winBonusPoints")}
            label="Points per win"
            description="On top of the nomination points."
            // Below the input, so both point inputs line up in the grid.
            inputWrapperOrder={["label", "input", "description", "error"]}
            inputMode="numeric"
            allowDecimal={false}
            allowNegative={false}
            clampBehavior="none"
            min={LIMITS.points.min}
            max={LIMITS.points.max}
            value={d.winBonusPoints}
            error={errors.winBonusPoints}
            readOnly={saving}
            onChange={(v) => set({ winBonusPoints: v }, "winBonusPoints")}
            onBlur={() => props.onBlur("winBonusPoints")}
          />
        </SimpleGrid>
      )}
      {!readOnly && bothZero ? (
        <Alert
          color="yellow"
          variant="light"
          icon={<AlertIcon variant="warning" />}
          role="status"
        >
          With no points for nominations or wins, nothing will score.
        </Alert>
      ) : null}
      {categories.length === 0 ? null : (
        <Stack gap="xs">
          <SettingsSectionHeading
            title="Category weights"
            meta={weightedMeta(weighted)}
          />
          {readOnly ? (
            <ReadOnlyRows
              rows={categories.map((c) => ({
                key: c.id,
                label: c.name,
                value: categoryWeightValue(saved.categories[c.id]?.weight ?? 1)
              }))}
            />
          ) : (
            <>
              <SettingsColumnHeader label="Weight" />
              <Stack component="ul" gap="var(--fo-space-0)" className="fo-listReset">
                {categories.map((c, idx) => {
                  const key = `weight:${c.id}`;
                  return (
                    <SettingsListRow
                      key={c.id}
                      fieldKey={key}
                      left={
                        <Text className="baseline-textBody baseline-wrapAnywhere">
                          {c.name}
                        </Text>
                      }
                      ariaLabel={`${c.name} weight`}
                      value={d.weights[c.id] ?? 1}
                      error={errors[key]}
                      decimal
                      min={0}
                      max={LIMITS.weight.max}
                      step={0.5}
                      readOnly={saving}
                      last={idx === categories.length - 1}
                      onChange={(v) => set({ weights: { ...d.weights, [c.id]: v } }, key)}
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
