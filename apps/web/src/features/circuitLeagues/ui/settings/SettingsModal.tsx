import type { ReactNode } from "react";
import { Box, Button, Group, Modal, Stack, Text, Title, VisuallyHidden } from "@ui";
import { FormStatus } from "@/shared/forms";
import type { ApiResult } from "@/lib/types";
import { SETTINGS_PRIMARY_ID } from "./dom";
import classes from "./Settings.module.css";

export type SettingsModalFrameMode = "apply" | "save" | "view";

/**
 * The frame the four settings modals share: centred on desktop, full screen
 * on phone, a scrolling body and a sticky footer. In apply and save modes the
 * body is a form whose submit is Done or Save; read-only has only Close.
 */
export function SettingsModal(props: {
  opened: boolean;
  title: string;
  size: "md" | "lg";
  phone: boolean;
  mode: SettingsModalFrameMode;
  dirty: boolean;
  saving: boolean;
  status: ApiResult | null;
  announcement: string;
  onClose: () => void;
  onReset: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const { opened, title, size, phone, mode, dirty, saving, status, announcement } = props;
  const footerClass = phone
    ? `${classes.stickyFooter} ${classes.stickyFooterPhone}`
    : classes.stickyFooter;
  const primaryLabel = mode === "save" ? (saving ? "Saving..." : "Save") : "Done";

  return (
    <Modal
      opened={opened}
      onClose={props.onClose}
      title={title}
      size={size}
      centered
      fullScreen={phone}
      radius={phone ? 0 : undefined}
      transitionProps={phone ? { transition: "fade" } : undefined}
      classNames={
        phone
          ? {
              root: classes.settingsModal,
              content: classes.phoneContent,
              body: classes.phoneBody
            }
          : { root: classes.settingsModal }
      }
    >
      {mode === "view" ? (
        <Stack gap="md">
          {props.children}
          <Group justify="flex-end" className={footerClass}>
            <Button type="button" variant="secondary" onClick={props.onClose}>
              Close
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack
          component="form"
          gap="md"
          onSubmit={(e: React.FormEvent) => {
            // The modal is in a portal: keep its submit from reaching a page form.
            e.preventDefault();
            e.stopPropagation();
            props.onSubmit();
          }}
        >
          {props.children}
          <Group justify="space-between" wrap="wrap" gap="sm" className={footerClass}>
            {status ? (
              <Box w="100%" role="alert">
                <FormStatus loading={false} result={status} />
              </Box>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={props.onReset}
              disabled={saving}
            >
              Reset to defaults
            </Button>
            <Group gap="sm" wrap="wrap" ml="auto">
              <Button
                type="button"
                variant="ghost"
                onClick={props.onClose}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                id={SETTINGS_PRIMARY_ID}
                disabled={saving || (mode === "save" && !dirty)}
              >
                {primaryLabel}
              </Button>
            </Group>
          </Group>
          <VisuallyHidden>
            <Text component="span" role="status" aria-live="polite">
              {announcement}
            </Text>
          </VisuallyHidden>
        </Stack>
      )}
    </Modal>
  );
}

/** "Events" with "4 of 6 on" on the right, over a list. */
export function SettingsSectionHeading(props: { title: string; meta: string }) {
  return (
    <Group justify="space-between" align="baseline" wrap="wrap" gap="sm">
      <Title order={3} variant="section">
        {props.title}
      </Title>
      <Text variant="meta">{props.meta}</Text>
    </Group>
  );
}

/** The column name over the inputs; each input has its own label. */
export function SettingsColumnHeader(props: { label: string }) {
  return (
    <Group justify="flex-end" wrap="nowrap" aria-hidden="true">
      <Text variant="meta" className={classes.columnHeader}>
        {props.label}
      </Text>
    </Group>
  );
}

/** The common props of the four area modals. */
export type AreaModalProps = {
  opened: boolean;
  phone: boolean;
  mode: SettingsModalFrameMode;
  dirty: boolean;
  saving: boolean;
  status: ApiResult | null;
  announcement: string;
  errors: Record<string, string>;
  onClose: () => void;
  onReset: () => void;
  onSubmit: () => void;
  onBlur: (key: string) => void;
};

/** The frame props an area modal passes through unchanged. */
export function frameProps(p: AreaModalProps) {
  return {
    opened: p.opened,
    phone: p.phone,
    mode: p.mode,
    dirty: p.dirty,
    saving: p.saving,
    status: p.status,
    announcement: p.announcement,
    onClose: p.onClose,
    onReset: p.onReset,
    onSubmit: p.onSubmit
  };
}
