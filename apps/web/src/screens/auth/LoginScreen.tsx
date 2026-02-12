import { Link } from "react-router-dom";
import { Box, Button, Grid, Stack, Text, Title } from "@ui";
import type { ApiResult, FieldErrors } from "../../lib/types";
import { FormField, FormStatus } from "../../ui/forms";
import { StandardCard } from "../../primitives";
import "../../primitives/baseline.css";

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
        <StandardCard component="section">
          <Box component="header">
            <Title variant="page">Sign in</Title>
            <Text variant="helper">Sign in with your username and password.</Text>
          </Box>
          <Box component="form" onSubmit={onSubmit} mt="md">
            <Stack gap="sm">
              <FormField label="Username" name="username" error={errors.username} />
              <FormField
                label="Password"
                name="password"
                type="password"
                error={errors.password}
              />
              <Button type="submit" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </Button>
              <FormStatus loading={loading} result={result} />
            </Stack>
          </Box>
        </StandardCard>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <StandardCard tone="nested" component="section">
          <Box component="header">
            <Title variant="card">New here?</Title>
            <Text>Create an account to join or run drafts.</Text>
          </Box>
          <Button component={Link} to="/register" variant="outline">
            Go to registration
          </Button>
        </StandardCard>
      </Grid.Col>
    </Grid>
  );
}
