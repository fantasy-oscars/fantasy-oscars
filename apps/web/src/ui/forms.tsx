import type { ApiResult } from "../lib/types";
import { Alert, Button, Loader, Text, TextInput } from "@mantine/core";

export function FormField(props: {
  label: string;
  name: string;
  type?: string;
  error?: string;
  defaultValue?: string;
}) {
  const { label, name, type = "text", error, defaultValue } = props;
  return (
    <TextInput
      className="field"
      label={label}
      name={name}
      type={type}
      defaultValue={defaultValue}
      error={error}
    />
  );
}

export function FormStatus(props: {
  loading: boolean;
  result: ApiResult | null;
  onRetry?: () => void;
}) {
  const { loading, result, onRetry } = props;
  if (loading) {
    return (
      <Alert
        className="status status-loading"
        icon={<Loader size="sm" />}
        role="status"
        aria-live="polite"
      >
        Working...
      </Alert>
    );
  }
  if (result) {
    const message =
      result.ok && result.message
        ? result.message
        : result.ok
          ? "Success"
          : result.message;
    return (
      <Alert
        className={`status ${result.ok ? "status-success" : "status-error"}`}
        role="status"
        aria-live="polite"
      >
        <Text size="sm">{message}</Text>
        {!result.ok && onRetry && (
          <Button variant="subtle" onClick={onRetry} mt="xs">
            Retry
          </Button>
        )}
      </Alert>
    );
  }
  return null;
}
