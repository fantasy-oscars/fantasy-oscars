import { useState } from "react";
import { VisuallyHidden } from "@ui";
import { isReconnection, type DraftConnectionState } from "@/decisions/draft/connection";

/**
 * Polite live regions for turn and pick announcements, and for the connection coming back.
 * Both stay mounted so that screen readers register them before the first message arrives.
 * "Reconnected" is its own region: it is announced once when the socket recovers and does
 * not repeat the turn message.
 */
export function DraftLiveRegion(props: {
  message: string;
  connectionState?: DraftConnectionState;
}) {
  const state = props.connectionState ?? "idle";
  const [seen, setSeen] = useState(state);
  const [reconnected, setReconnected] = useState(false);
  if (seen !== state) {
    setSeen(state);
    setReconnected(isReconnection(seen, state));
  }

  return (
    <>
      <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
        {props.message}
      </VisuallyHidden>
      <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
        {reconnected ? "Reconnected" : ""}
      </VisuallyHidden>
    </>
  );
}
