import { Alert, Group, Loader, Text } from "@ui";

export function PageLoader(props: { label?: string }) {
  return (
    <Group className="page-state" role="status" aria-live="polite" gap="xs">
      <Loader size="sm" aria-hidden="true" />
      <Text span>{props.label ?? "Loading..."}</Text>
    </Group>
  );
}

export function PageError(props: { message: string }) {
  return (
    <Alert className="page-state status status-error" color="red" role="alert">
      {props.message}
    </Alert>
  );
}
