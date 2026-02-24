import { notifications } from "@ui/notifications";
import { canonicalTypeFor } from "./decisionTree";
import type { CanonicalNotificationType, NotificationEvent } from "./model";
import { pushRuntimeBanner } from "./runtimeBanners";

type NotifyResult =
  | { type: "toast" }
  | { type: "inline_alert"; message: string; title?: string }
  | { type: "broadcast_banner"; message: string }
  | { type: "inbox_notification"; message: string }
  | { type: "blocking_system_alert"; message: string }
  | { type: "confirmation_modal" };

const lastDispatchById = new Map<string, CanonicalNotificationType>();

function devWarnForbiddenPairing(eventId: string, nextType: CanonicalNotificationType) {
  if (import.meta.env?.MODE === "production") return;
  const prior = lastDispatchById.get(eventId);
  if (!prior) {
    lastDispatchById.set(eventId, nextType);
    return;
  }
  if (prior === nextType) return;
  // One message, one surface: warn loudly in dev to prevent regressions.
  console.warn(
    `[notifications] Forbidden pairing: event '${eventId}' dispatched as '${prior}' and '${nextType}'.`
  );
  lastDispatchById.set(eventId, nextType);
}

export function notify(event: NotificationEvent): NotifyResult {
  const type = canonicalTypeFor(event);
  devWarnForbiddenPairing(event.id, type);

  if (type === "toast") {
    const color =
      event.severity === "success"
        ? "green"
        : event.severity === "warning"
          ? "yellow"
          : event.severity === "error" || event.severity === "critical"
            ? "red"
            : undefined;
    notifications.show({
      title: event.title,
      message: event.message,
      color
    });
    return { type: "toast" };
  }

  // Other canonical types are returned so callers can render the correct surface.
  // We intentionally avoid implementing new global surfaces here.
  if (type === "inline_alert") {
    return { type: "inline_alert", message: event.message, title: event.title };
  }
  if (type === "broadcast_banner") {
    pushRuntimeBanner({
      id: event.id,
      message: event.message,
      variant:
        event.severity === "warning"
          ? "warning"
          : event.severity === "error" || event.severity === "critical"
            ? "error"
            : "info"
    });
    return { type: "broadcast_banner", message: event.message };
  }
  if (type === "inbox_notification") {
    return { type: "inbox_notification", message: event.message };
  }
  if (type === "blocking_system_alert") {
    pushRuntimeBanner({
      id: event.id,
      message: event.message,
      variant: "error",
      expires_at: null,
      dismissible: true
    });
    return { type: "blocking_system_alert", message: event.message };
  }
  return { type: "confirmation_modal" };
}
