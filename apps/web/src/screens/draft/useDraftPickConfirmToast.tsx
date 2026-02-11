import { Box, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useRef } from "react";

export function useDraftPickConfirmToast(args: {
  enabled: boolean;
  onConfirmPick: (nominationId: number) => void;
  onClearSelection: () => void;
}) {
  const confirmTimerRef = useRef<number | null>(null);
  const confirmNominationRef = useRef<number | null>(null);
  const confirmToastIdRef = useRef<string | null>(null);

  const clearConfirmTimer = () => {
    if (confirmTimerRef.current) {
      window.clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  };

  const cancelDraftConfirmToast = () => {
    const id = confirmToastIdRef.current;
    if (id) notifications.hide(id);
    confirmToastIdRef.current = null;
    confirmNominationRef.current = null;
    clearConfirmTimer();
  };

  const scheduleDraftConfirmToast = (payload: { nominationId: number; label: string }) => {
    cancelDraftConfirmToast();
    clearConfirmTimer();
    confirmNominationRef.current = payload.nominationId;

    confirmTimerRef.current = window.setTimeout(() => {
      const nominationId = confirmNominationRef.current;
      if (!nominationId) return;

      const toastId = `draft.confirm.${nominationId}.${Date.now()}`;
      confirmToastIdRef.current = toastId;
      notifications.show({
        id: toastId,
        autoClose: false,
        withCloseButton: true,
        onClose: () => {
          confirmToastIdRef.current = null;
          confirmNominationRef.current = null;
          args.onClearSelection();
        },
        message: (
          <Box
            data-fo-draft-confirm-toast="true"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              cancelDraftConfirmToast();
              args.onConfirmPick(nominationId);
            }}
            style={{ cursor: "pointer" }}
          >
            <Text fw={700}>Confirm draft pick</Text>
            <Text c="dimmed" size="sm">
              Draft “{payload.label}”
            </Text>
          </Box>
        )
      });
    }, 220);
  };

  useEffect(() => {
    // Cleanup any pending confirm UI if the user loses the ability to draft.
    if (!args.enabled) {
      clearConfirmTimer();
      confirmNominationRef.current = null;
      cancelDraftConfirmToast();
    }
    return () => {
      cancelDraftConfirmToast();
      clearConfirmTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.enabled]);

  useEffect(() => {
    // Clicking anywhere outside the toast cancels the pending draft confirmation.
    const onPointerDown = () => {
      if (!confirmToastIdRef.current) return;
      cancelDraftConfirmToast();
      args.onClearSelection();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    scheduleDraftConfirmToast,
    cancelDraftConfirmToast,
    clearConfirmTimer
  };
}

