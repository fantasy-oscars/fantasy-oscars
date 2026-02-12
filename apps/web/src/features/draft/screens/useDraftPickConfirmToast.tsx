import { Box, Text } from "@ui";
import { notifications } from "@ui/notifications";
import { useCallback, useEffect, useRef } from "react";

export function useDraftPickConfirmToast(args: {
  enabled: boolean;
  onConfirmPick: (nominationId: number) => void;
  onClearSelection: () => void;
}) {
  const onConfirmPickRef = useRef(args.onConfirmPick);
  const onClearSelectionRef = useRef(args.onClearSelection);
  useEffect(() => {
    onConfirmPickRef.current = args.onConfirmPick;
  }, [args.onConfirmPick]);
  useEffect(() => {
    onClearSelectionRef.current = args.onClearSelection;
  }, [args.onClearSelection]);

  const confirmTimerRef = useRef<number | null>(null);
  const confirmNominationRef = useRef<number | null>(null);
  const confirmToastIdRef = useRef<string | null>(null);

  const clearConfirmTimer = useCallback(() => {
    if (confirmTimerRef.current) {
      window.clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }, []);

  const cancelDraftConfirmToast = useCallback(() => {
    const id = confirmToastIdRef.current;
    if (id) notifications.hide(id);
    confirmToastIdRef.current = null;
    confirmNominationRef.current = null;
    clearConfirmTimer();
  }, [clearConfirmTimer]);

  const scheduleDraftConfirmToast = useCallback((payload: { nominationId: number; label: string }) => {
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
          onClearSelectionRef.current();
        },
        message: (
          <Box
            data-fo-draft-confirm-toast="true"
            className="fo-clickable"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              cancelDraftConfirmToast();
              onConfirmPickRef.current(nominationId);
            }}
          >
            <Text fw="var(--fo-font-weight-bold)">Confirm draft pick</Text>
            <Text c="dimmed" size="sm">
              Draft “{payload.label}”
            </Text>
          </Box>
        )
      });
    }, 220);
  }, [cancelDraftConfirmToast, clearConfirmTimer]);

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
  }, [args.enabled, cancelDraftConfirmToast, clearConfirmTimer]);

  useEffect(() => {
    // Clicking anywhere outside the toast cancels the pending draft confirmation.
    const onPointerDown = () => {
      if (!confirmToastIdRef.current) return;
      cancelDraftConfirmToast();
      onClearSelectionRef.current();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [cancelDraftConfirmToast]);

  return {
    scheduleDraftConfirmToast,
    cancelDraftConfirmToast,
    clearConfirmTimer
  };
}
