import { Link } from "react-router-dom";
import { Box, Button, Card, Grid, Stack, Text, Title } from "@mantine/core";
import type { ApiResult, FieldErrors } from "../../lib/types";
import { FormField, FormStatus } from "../../ui/forms";

export function RegisterScreen(props: {
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
            <Title order={2}>Create Account</Title>
            <Text>Pick a username and join a league.</Text>
          </Box>
          <Box component="form" onSubmit={onSubmit}>
            <Stack gap="sm">
              <FormField label="Username" name="username" error={errors.username} />
              <FormField label="Email" name="email" error={errors.email} />
              <FormField
                label="Password"
                name="password"
                type="password"
                error={errors.password}
              />
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Register"}
              </Button>
              <FormStatus loading={loading} result={result} />
            </Stack>
          </Box>
        </Card>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <Card className="card" component="section">
          <Box component="header">
            <Title order={3}>Already have an account?</Title>
            <Text>Sign in to view leagues and drafts.</Text>
          </Box>
          <Button component={Link} to="/login" variant="subtle">
            Go to login
          </Button>
        </Card>
      </Grid.Col>
    </Grid>
  );
}
