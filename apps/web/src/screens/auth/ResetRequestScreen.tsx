import type { ApiResult, FieldErrors } from "../../lib/types";
import { Box, Button, Card, Text, Title } from "@mantine/core";
import { FormField, FormStatus } from "../../ui/forms";

export function ResetRequestScreen(props: {
  errors: FieldErrors;
  result: ApiResult | null;
  loading: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  const { errors, result, loading, onSubmit } = props;
  return (
    <Card className="card" component="section">
      <Box component="header">
        <Title order={2}>Reset Password</Title>
        <Text className="muted">Request a reset token.</Text>
      </Box>
      <Box component="form" onSubmit={onSubmit}>
        <FormField label="Username" name="username" error={errors.username} />
        <Button type="submit" disabled={loading}>
          {loading ? "Requesting..." : "Request reset"}
        </Button>
      </Box>
      <FormStatus loading={loading} result={result} />
    </Card>
  );
}
