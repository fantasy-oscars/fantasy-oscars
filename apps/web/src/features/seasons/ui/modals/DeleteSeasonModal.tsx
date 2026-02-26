import { DestructiveActionModal } from "@/shared/modals/DestructiveActionModal";

export function DeleteSeasonModal(props: {
  opened: boolean;
  onClose: () => void;
  working: boolean;
  onConfirm: () => void | Promise<void>;
  error?: string | null;
}) {
  const { opened, onClose, working, onConfirm, error } = props;

  return (
    <DestructiveActionModal
      opened={opened}
      onClose={onClose}
      title="Delete season?"
      summary="Deleting this season cancels it and blocks drafting for this league/ceremony pairing."
      consequences={[{ label: "Seasons removed", value: 1 }]}
      confirmPhrase="DELETE"
      confirmLabel="Delete season"
      loading={working}
      error={error}
      onConfirm={() => void onConfirm()}
    />
  );
}
