import { Box, Text } from "@ui";
import type { DraftConnectionView } from "@/decisions/draft/connection";

/** Small corner chip shown only while the live connection is not healthy. */
export function DraftConnectionIndicator(props: { connection: DraftConnectionView }) {
  const { connection } = props;
  if (!connection.visible) return null;
  return (
    <Box
      className="dr-connection"
      role="status"
      data-state={connection.state}
      data-testid="draft-connection-indicator"
    >
      <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
        {connection.state === "disconnected" ? "cloud_off" : "sync"}
      </Text>
      <Text component="span" className="dr-connectionLabel">
        {connection.label}
      </Text>
    </Box>
  );
}
