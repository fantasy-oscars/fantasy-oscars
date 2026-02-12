import {
  ActionIcon,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text
} from "@ui";

export type SeasonDraftSettingsDraft = {
  scoringStrategy: "fixed" | "negative" | "category_weighted";
  allocationStrategy: "UNDRAFTED" | "FULL_POOL";
  timerEnabled: boolean;
  pickTimerSeconds: number;
};

export function SeasonDraftSettingsModal(props: {
  opened: boolean;
  onClose: () => void;

  canEdit: boolean;
  working: boolean;
  locked: boolean;
  ceremonyId: number | null;
  weightsLoading: boolean;

  draftDefaults: {
    scoring: SeasonDraftSettingsDraft["scoringStrategy"];
    allocation: SeasonDraftSettingsDraft["allocationStrategy"];
    timerEnabled: boolean;
    pickTimerSeconds: number;
  };
  settingsDraft: SeasonDraftSettingsDraft | null;
  setSettingsDraft: (next: SeasonDraftSettingsDraft | null) => void;
  onOpenWeights: () => void | Promise<void>;
  onSave: (draft: SeasonDraftSettingsDraft) => void | Promise<void>;
}) {
  const {
    opened,
    onClose,
    canEdit,
    working,
    locked,
    ceremonyId,
    weightsLoading,
    draftDefaults,
    settingsDraft,
    setSettingsDraft,
    onOpenWeights,
    onSave
  } = props;

  const active = settingsDraft ?? {
    scoringStrategy: draftDefaults.scoring,
    allocationStrategy: draftDefaults.allocation,
    timerEnabled: draftDefaults.timerEnabled,
    pickTimerSeconds: draftDefaults.pickTimerSeconds
  };

  return (
    <Modal
      opened={opened}
      onClose={() => {
        onClose();
        setSettingsDraft(null);
      }}
      title="Adjust draft settings"
      centered
    >
      <Stack gap="md">
        <Select
          label="Scoring"
          value={active.scoringStrategy}
          onChange={(v) => {
            const next = (v ?? "fixed") as SeasonDraftSettingsDraft["scoringStrategy"];
            setSettingsDraft({ ...active, scoringStrategy: next });
          }}
          disabled={!canEdit || working || locked}
          data={[
            { value: "fixed", label: "Standard" },
            { value: "negative", label: "Negative" },
            { value: "category_weighted", label: "Category-weighted" }
          ]}
        />

        {active.scoringStrategy === "category_weighted" ? (
          <Group gap="xs" align="center">
            <ActionIcon
              type="button"
              variant="subtle"
              aria-label="Edit category weights"
              disabled={!canEdit || working || locked || !ceremonyId}
              onClick={() => void onOpenWeights()}
            >
              <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
                settings
              </Text>
            </ActionIcon>
            <Text className="baseline-textMeta" c="dimmed">
              Category weights
            </Text>
            {weightsLoading ? (
              <Text className="baseline-textMeta" c="dimmed">
                Loading…
              </Text>
            ) : null}
          </Group>
        ) : null}

        <Select
          label="Allocation"
          value={active.allocationStrategy}
          onChange={(v) => {
            const next = (v ?? "UNDRAFTED") as SeasonDraftSettingsDraft["allocationStrategy"];
            setSettingsDraft({ ...active, allocationStrategy: next });
          }}
          disabled={!canEdit || working || locked}
          data={[
            { value: "UNDRAFTED", label: "Leave extras undrafted" },
            { value: "FULL_POOL", label: "Use full pool (extras drafted)" }
          ]}
        />

        <Group className="inline-form" wrap="wrap" align="flex-end">
          <Switch
            label="Pick timer"
            checked={active.timerEnabled}
            onChange={(e) => setSettingsDraft({ ...active, timerEnabled: e.currentTarget.checked })}
            disabled={!canEdit || working || locked}
          />
          <NumberInput
            label="Seconds per pick"
            value={active.pickTimerSeconds}
            onChange={(v) => setSettingsDraft({ ...active, pickTimerSeconds: Number(v) || 0 })}
            min={0}
            step={5}
            disabled={!canEdit || working || locked || !active.timerEnabled}
          />
        </Group>

        <Group justify="flex-end" wrap="wrap">
          <Button
            type="button"
            variant="subtle"
            onClick={() => {
              onClose();
              setSettingsDraft(null);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void onSave(active)}
            disabled={!canEdit || working || locked}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
