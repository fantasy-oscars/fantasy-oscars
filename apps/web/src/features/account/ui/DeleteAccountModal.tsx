import { DestructiveActionModal } from "@/shared/modals/DestructiveActionModal";

export function DeleteAccountModal(props: {
  opened: boolean;
  onClose: () => void;
  working: boolean;
  error?: string | null;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <DestructiveActionModal
      opened={props.opened}
      onClose={props.onClose}
      title="Delete your account?"
      summary="This permanently removes your account. Any completed draft history will be preserved anonymously — your picks stay on the record, but your name won't be attached to them. Like a winner who asked not to be named."
      consequences={[]}
      confirmPhrase="and the winner is"
      confirmLabel="Delete my account"
      loading={props.working}
      error={props.error}
      onConfirm={() => void props.onConfirm()}
    />
  );
}
