import { Button, Group, Modal, NumberInput, Stack, Text } from "@ui";

export function SeasonCategoryWeightsModal(props: {
  opened: boolean;
  onClose: () => void;
  locked: boolean;
  canEdit: boolean;
  working: boolean;

  error: string | null;
  categories: Array<{ id: number; name: string }>;
  weights: Record<string, number>;
  setWeights: (next: Record<string, number>) => void;
  onSave: (weights: Record<string, number>) => void | Promise<void>;
}) {
  const {
    opened,
    onClose,
    locked,
    canEdit,
    working,
    error,
    categories,
    weights,
    setWeights,
    onSave
  } = props;

  return (
    <Modal opened={opened} onClose={onClose} title="Category weights" centered>
      <Stack gap="md">
        {error ? (
          <Text className="baseline-textBody" c="red">
            {error}
          </Text>
        ) : null}

        {categories.length === 0 ? (
          <Text className="baseline-textBody" c="dimmed">
            No categories.
          </Text>
        ) : (
          <Stack gap="sm">
            {categories.map((c) => (
              <Group key={c.id} justify="space-between" wrap="nowrap" gap="md">
                <Text className="baseline-textBody">{c.name}</Text>
                <NumberInput
                  value={weights[String(c.id)] ?? 1}
                  onChange={(v) => {
                    const n = Math.trunc(Number(v) || 0);
                    setWeights({
                      ...weights,
                      [String(c.id)]: Math.max(-99, Math.min(99, n))
                    });
                  }}
                  min={-99}
                  max={99}
                  step={1}
                  w="calc(var(--fo-space-md) * 5)"
                />
              </Group>
            ))}
          </Stack>
        )}

        <Group justify="flex-end" wrap="wrap">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void onSave(weights)}
            disabled={!canEdit || working || locked}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
