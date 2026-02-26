import { DestructiveActionModal } from "@/shared/modals/DestructiveActionModal";

export function DeleteLeagueModal(props: {
  opened: boolean;
  onClose: () => void;
  working: boolean;
  seasonsRemoved: number;
  onConfirm: () => void;
  error?: string | null;
}) {
  const { opened, onClose, working, onConfirm, seasonsRemoved, error } = props;

  return (
    <DestructiveActionModal
      opened={opened}
      onClose={onClose}
      title="Delete league?"
      summary="Deleting this league will permanently remove the league and all seasons it contains."
      consequences={[{ label: "Seasons removed", value: seasonsRemoved }]}
      confirmPhrase="DELETE"
      confirmLabel="Delete league"
      loading={working}
      error={error}
      onConfirm={onConfirm}
    />
  );
}
