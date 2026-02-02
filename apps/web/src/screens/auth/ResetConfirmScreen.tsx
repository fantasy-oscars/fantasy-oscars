import type { ApiResult, FieldErrors } from "../../lib/types";
import { Box, Button, Card, Text, Title } from "@mantine/core";
import { FormField, FormStatus } from "../../ui/forms";

export function ResetConfirmScreen(props: {
  errors: FieldErrors;
  result: ApiResult | null;
  loading: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  const { errors, result, loading, onSubmit } = props;
  return (
    <Card className="card" component="section">
      <Box component="header">
        <Title order={2}>Set New Password</Title>
        <Text className="muted">Paste the reset token and choose a new password.</Text>
      </Box>
      <Box component="form" onSubmit={onSubmit}>
        <FormField label="Reset token" name="token" error={errors.token} />
        <FormField
          label="New password"
          name="password"
          type="password"
          error={errors.password}
        />
        <Button type="submit" disabled={loading}>
          {loading ? "Updating..." : "Update password"}
        </Button>
      </Box>
      <FormStatus loading={loading} result={result} />
    </Card>
  );
}
