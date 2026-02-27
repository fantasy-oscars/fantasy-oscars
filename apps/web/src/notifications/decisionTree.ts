import type { CanonicalNotificationType, NotificationEvent } from "./model";

// Single source of truth for the canonical notification decision tree.
export function canonicalTypeFor(event: NotificationEvent): CanonicalNotificationType {
  // Step 1: requires decision right now?
  if (event.requires_decision) return "confirmation_modal";

  // Severity gates (rare).
  if (event.severity === "critical") return "blocking_system_alert";

  // Step 2: immediate feedback for a user action that just happened?
  if (event.trigger_type === "user_action") return "toast";

  // Draft pick events are time-sensitive and should surface as toasts even when
  // delivered via websocket/async events. (Draft pages still render a banner stack
  // for true broadcast banners like announcements.)
  if (
    event.durability === "ephemeral" &&
    event.scope === "local" &&
    (event.id.startsWith("draft.pick.") ||
      event.id.startsWith("draft.autopick.") ||
      event.id.startsWith("ceremony.winner."))
  ) {
    return "toast";
  }

  // Step 3: tied to a specific screen/constraint/validation that persists?
  if (event.trigger_type === "validation") return "inline_alert";

  // Step 4: durable vs ambient.
  if (event.durability === "stored") return "inbox_notification";
  if (event.durability === "persistent") return "broadcast_banner";

  // Ephemeral non-action events are ambient, not action outcomes.
  return "broadcast_banner";
}
