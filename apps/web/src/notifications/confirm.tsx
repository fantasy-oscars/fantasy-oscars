import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Button, Group, Modal, Text } from "@mantine/core";

export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmApi = {
  confirm: (req: ConfirmRequest) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmApi | null>(null);

let globalConfirmImpl: ((req: ConfirmRequest) => Promise<boolean>) | null = null;

// Non-hook usage (e.g. orchestration) – provider installs an implementation at runtime.
export async function confirm(req: ConfirmRequest): Promise<boolean> {
  if (globalConfirmImpl) return globalConfirmImpl(req);
  // Fallback keeps behavior working if provider isn't mounted for any reason.
  // This is not the preferred UX, but it avoids silent no-ops.
  return window.confirm(req.message);
}

export function useConfirm(): ConfirmApi {
  const api = useContext(ConfirmContext);
  if (!api) {
    return { confirm };
  }
  return api;
}

export function ConfirmProvider(props: { children: React.ReactNode }) {
  const { children } = props;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<{
    req: ConfirmRequest;
    resolve: (val: boolean) => void;
  } | null>(null);

  const confirmImpl = useCallback(async (req: ConfirmRequest) => {
    return await new Promise<boolean>((resolve) => {
      setPending({ req, resolve });
      setOpen(true);
    });
  }, []);

  // Install a global impl for non-hook call sites.
  globalConfirmImpl = confirmImpl;

  const api = useMemo<ConfirmApi>(() => ({ confirm: confirmImpl }), [confirmImpl]);

  const close = useCallback(
    (val: boolean) => {
      if (pending) pending.resolve(val);
      setOpen(false);
      setPending(null);
    },
    [pending]
  );

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      <Modal
        opened={open}
        onClose={() => close(false)}
        title={pending?.req.title ?? "Confirm"}
        centered
        withCloseButton
      >
        <Text>{pending?.req.message ?? ""}</Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => close(false)}>
            {pending?.req.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            color={pending?.req.danger ? "red" : undefined}
            onClick={() => close(true)}
          >
            {pending?.req.confirmLabel ?? "Confirm"}
          </Button>
        </Group>
      </Modal>
    </ConfirmContext.Provider>
  );
}
