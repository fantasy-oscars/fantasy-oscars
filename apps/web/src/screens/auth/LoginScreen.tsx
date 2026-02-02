import { Link } from "react-router-dom";
import { Box, Button, Card, Grid, Stack, Text, Title } from "@mantine/core";
import type { ApiResult, FieldErrors } from "../../lib/types";
import { FormField, FormStatus } from "../../ui/forms";

export function LoginScreen(props: {
  errors: FieldErrors;
  result: ApiResult | null;
  loading: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  const { errors, result, loading, onSubmit } = props;
  return (
    <Grid className="card-grid" gutter="lg">
      <Grid.Col span={{ base: 12, md: 6 }}>
        <Card className="card" component="section">
          <Box component="header">
            <Title order={2}>Login</Title>
            <Text>Sign in with your username and password.</Text>
          </Box>
          <Box component="form" onSubmit={onSubmit}>
            <Stack gap="sm">
              <FormField label="Username" name="username" error={errors.username} />
              <FormField
                label="Password"
                name="password"
                type="password"
                error={errors.password}
              />
              <Button type="submit" disabled={loading}>
                {loading ? "Signing in..." : "Login"}
              </Button>
              <FormStatus loading={loading} result={result} />
            </Stack>
          </Box>
        </Card>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <Card className="card" component="section">
          <Box component="header">
            <Title order={3}>New here?</Title>
            <Text>Create an account to join or run drafts.</Text>
          </Box>
          <Button component={Link} to="/register" variant="subtle">
            Go to registration
          </Button>
        </Card>
      </Grid.Col>
    </Grid>
  );
}
