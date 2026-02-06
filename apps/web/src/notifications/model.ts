export type NotificationSeverity = "info" | "success" | "warning" | "error" | "critical";

export type NotificationTriggerType = "user_action" | "validation" | "system" | "async";

export type NotificationScope = "local" | "global";

export type NotificationDurability = "ephemeral" | "persistent" | "stored";

export type CanonicalNotificationType =
  | "broadcast_banner"
  | "toast"
  | "inline_alert"
  | "confirmation_modal"
  | "inbox_notification"
  | "blocking_system_alert";

export type NotificationEvent = {
  // Stable identifier for dedupe/logging; not user-visible.
  id: string;
  severity: NotificationSeverity;
  trigger_type: NotificationTriggerType;
  scope: NotificationScope;
  durability: NotificationDurability;
  requires_decision: boolean;
  message: string;
  title?: string;

  // Optional app-specific metadata for future routing/analytics.
  context?: Record<string, unknown>;
};
