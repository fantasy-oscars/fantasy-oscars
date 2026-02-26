import { useMemo, useState } from "react";
import { Alert, Button, Group, Modal, Stack, Text, TextInput } from "@ui";

export type DestructiveConsequence = {
  label: string;
  value: string | number;
};

export function DestructiveActionModal(props: {
  opened: boolean;
  onClose: () => void;
  title: string;
  summary: string;
  consequences: DestructiveConsequence[];
  confirmLabel: string;
  confirmPhrase: string;
  loading?: boolean;
  error?: string | null;
  contextLinks?: Array<{ label: string; href: string }>;
  onConfirm: () => void | Promise<void>;
}) {
  const {
    opened,
    onClose,
    title,
    summary,
    consequences,
    confirmLabel,
    confirmPhrase,
    loading,
    error,
    contextLinks,
    onConfirm
  } = props;
  const [typed, setTyped] = useState("");

  const normalizedTyped = useMemo(() => typed.trim(), [typed]);
  const canConfirm =
    normalizedTyped === confirmPhrase && !loading && confirmPhrase.trim().length > 0;

  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <Stack gap="md">
        <Text className="baseline-textBody">{summary}</Text>

        <Stack gap="var(--fo-space-dense-2)">
          {consequences.map((entry) => (
            <Group key={entry.label} justify="space-between" wrap="nowrap">
              <Text className="baseline-textMeta">{entry.label}</Text>
              <Text className="baseline-textBody" fw="var(--fo-font-weight-bold)">
                {entry.value}
              </Text>
            </Group>
          ))}
        </Stack>

        {contextLinks?.length ? (
          <Stack gap="var(--fo-space-dense-2)">
            {contextLinks.map((link) => (
              <Text
                key={`${link.label}.${link.href}`}
                className="baseline-textMeta"
                component="a"
                href={link.href}
              >
                {link.label}
              </Text>
            ))}
          </Stack>
        ) : null}

        <TextInput
          label={`Type "${confirmPhrase}" to continue`}
          value={typed}
          onChange={(e) => setTyped(e.currentTarget.value)}
          autoComplete="off"
          spellCheck={false}
        />

        {error ? <Alert color="red">{error}</Alert> : null}

        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose} disabled={Boolean(loading)}>
            Cancel
          </Button>
          <Button color="red" onClick={() => void onConfirm()} disabled={!canConfirm}>
            {loading ? "Working..." : confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
