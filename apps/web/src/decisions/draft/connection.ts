/** Socket connection lifecycle as the draft room shows it. */
export type DraftConnectionState =
  | "idle" // no socket wanted (signed out, preview)
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type DraftConnectionEvent =
  | "start"
  | "connect"
  | "disconnect_transient" // transport dropped; the client will retry on its own
  | "disconnect_final" // server or user closed it; no automatic retry
  | "reconnect_attempt"
  | "connect_error"
  | "stop";

export function nextConnectionState(
  prev: DraftConnectionState,
  event: DraftConnectionEvent
): DraftConnectionState {
  switch (event) {
    case "start":
      return "connecting";
    case "connect":
      return "connected";
    case "disconnect_transient":
      return "reconnecting";
    case "disconnect_final":
      return "disconnected";
    case "reconnect_attempt":
    case "connect_error":
      // Failing the very first connection reads as "connecting"; failing after we
      // had one reads as "reconnecting".
      return prev === "connecting" || prev === "idle" ? "connecting" : "reconnecting";
    case "stop":
      return "idle";
  }
}

export type DraftConnectionView = {
  state: DraftConnectionState;
  /** Whether the indicator should be on screen. */
  visible: boolean;
  /** Short text for the indicator. */
  label: string;
  /** Set while picks must not be submitted; doubles as the user-facing reason. */
  pickBlockedReason: string | null;
};

export function describeConnection(state: DraftConnectionState): DraftConnectionView {
  switch (state) {
    case "connecting":
      return {
        state,
        visible: true,
        label: "Connecting to the draft…",
        pickBlockedReason: null
      };
    case "reconnecting":
      return {
        state,
        visible: true,
        label: "Connection lost. Reconnecting…",
        pickBlockedReason: "Reconnecting to the draft. Picks resume once you are back."
      };
    case "disconnected":
      return {
        state,
        visible: true,
        label: "Disconnected from the draft.",
        pickBlockedReason: "Disconnected from the draft. Reload to make picks."
      };
    case "connected":
    case "idle":
      return { state, visible: false, label: "", pickBlockedReason: null };
  }
}
