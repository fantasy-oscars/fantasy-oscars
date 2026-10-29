import { VisuallyHidden } from "@ui";

/**
 * Polite live region for turn and pick announcements. It stays mounted so that
 * screen readers register it before the first message arrives.
 */
export function DraftLiveRegion(props: { message: string }) {
  return (
    <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
      {props.message}
    </VisuallyHidden>
  );
}
