import { Alert, Group, Loader, Text } from "@ui";

export function PageLoader(props: { label?: string }) {
  return (
    <Group className="page-state" role="status" aria-live="polite" gap="xs">
      <Loader size="sm" aria-hidden="true" />
      <Text span>{props.label ?? "Loading..."}</Text>
    </Group>
  );
}

/**
 * Standard error display. When the failed request carried an id, show it so
 * users can quote it to support.
 */
export function PageError(props: { message: string; requestId?: string | null }) {
  return (
    <Alert className="page-state status status-error" color="red" role="alert">
      {props.message}
      {props.requestId ? (
        <Text size="xs" className="page-state-reference">
          Reference: {props.requestId}
        </Text>
      ) : null}
    </Alert>
  );
}
