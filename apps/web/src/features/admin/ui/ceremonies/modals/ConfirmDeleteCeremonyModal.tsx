import { DestructiveActionModal } from "@/shared/modals/DestructiveActionModal";

export function ConfirmDeleteCeremonyModal(props: {
  opened: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  ceremonyName: string;
  seasonsRemoved: number;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <DestructiveActionModal
      opened={props.opened}
      onClose={props.onCancel}
      title="Delete ceremony?"
      summary={`Deleting "${props.ceremonyName}" removes that ceremony and all of its seasons.`}
      consequences={[{ label: "Seasons removed", value: props.seasonsRemoved }]}
      confirmPhrase="DELETE"
      confirmLabel="Delete ceremony"
      loading={props.loading}
      error={props.error}
      onConfirm={props.onConfirm}
    />
  );
}
