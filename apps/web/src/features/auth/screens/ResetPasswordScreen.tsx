import { Link } from "react-router-dom";
import { Anchor, Box, Button, Grid, Stack, Text, Title } from "@ui";
import type { ApiResult, FieldErrors } from "@/lib/types";
import { FormField, FormStatus } from "@/shared/forms";
import { StandardCard } from "@/primitives";
import "@/primitives/baseline.css";

export function ResetPasswordScreen(props: {
  errors: FieldErrors;
  result: ApiResult | null;
  loading: boolean;
  /** The link has no token, or the API rejected it (invalid, expired or used). */
  linkInvalid: boolean;
  onInput: (e: React.FormEvent<HTMLElement>) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  const { errors, result, loading, linkInvalid, onInput, onSubmit } = props;
  return (
    <Grid className="card-grid" gutter="lg">
      {/* The link's token must never leave in a Referer header. React hoists this to <head>. */}
      <meta name="referrer" content="no-referrer" />
      <Grid.Col span={{ base: 12, md: 6 }}>
        <StandardCard component="section">
          <Box component="header">
            <Title variant="page" className="baseline-textHeroTitle">
              Choose a new password
            </Title>
            {linkInvalid ? null : (
              <Text variant="helper">
                After you save it, you&apos;ll be signed out everywhere and can sign in
                with the new password.
              </Text>
            )}
          </Box>
          {linkInvalid ? (
            <Stack gap="sm" mt="md">
              <Box className="status status-error" role="status">
                <Text>This reset link is invalid or has expired.</Text>
              </Box>
              <Text variant="helper">
                Links work once and expire after an hour.{" "}
                <Anchor component={Link} to="/forgot-password">
                  Ask for a new link
                </Anchor>
              </Text>
            </Stack>
          ) : (
            <Box component="form" onSubmit={onSubmit} onInput={onInput} mt="md">
              <Stack gap="sm">
                <FormField
                  label="New password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  error={errors.password}
                />
                <FormField
                  label="Confirm new password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  error={errors.confirmPassword}
                />
                <Button type="submit" loading={loading} variant="primary">
                  {loading ? "Saving..." : "Save new password"}
                </Button>
                <FormStatus loading={loading} result={result} />
              </Stack>
            </Box>
          )}
        </StandardCard>
      </Grid.Col>
    </Grid>
  );
}
