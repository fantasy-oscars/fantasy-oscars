import type { ApiResult } from "../lib/types";
import { Alert, Button, Loader, Text, TextInput } from "@ui";

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
  // FormStatus is an Inline Alert (surface C) and should only be used for
  // persistent, local constraints/errors. Action outcomes are communicated via Toast.
  if (result && !result.ok) {
    const message = result.message;
    return (
      <Alert className="status status-error" role="status" aria-live="polite">
        <Text size="sm">{message}</Text>
        {onRetry && (
          <Button variant="subtle" onClick={onRetry} mt="xs">
            Retry
          </Button>
        )}
      </Alert>
    );
  }
  return null;
}
