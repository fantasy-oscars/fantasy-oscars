import { Box, Button, Group, Text, Title } from "@ui";
import { StandardCard } from "@/primitives";

export function WinnersConfirmOverlay(props: {
  ariaLabel: string;
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Box className="modal-backdrop" role="presentation">
      <StandardCard
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={props.ariaLabel}
      >
        <Title order={4}>{props.title}</Title>
        <Text className="muted">{props.message}</Text>
        <Group className="inline-actions" wrap="wrap">
          <Button type="button" onClick={props.onCancel}>
            {props.cancelLabel}
          </Button>
          <Button type="button" variant="subtle" onClick={props.onConfirm}>
            {props.confirmLabel}
          </Button>
        </Group>
      </StandardCard>
    </Box>
  );
}
