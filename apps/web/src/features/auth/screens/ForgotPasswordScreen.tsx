import { Link } from "react-router-dom";
import { Anchor, Box, Button, Grid, Stack, Text, Title } from "@ui";
import type { ApiResult, FieldErrors } from "@/lib/types";
import { FormField, FormStatus } from "@/shared/forms";
import { StandardCard } from "@/primitives";
import "@/primitives/baseline.css";

export function ForgotPasswordScreen(props: {
  errors: FieldErrors;
  result: ApiResult | null;
  loading: boolean;
  sent: boolean;
  onInput: (e: React.FormEvent<HTMLElement>) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  const { errors, result, loading, sent, onInput, onSubmit } = props;
  return (
    <Grid className="card-grid" gutter="lg">
      <Grid.Col span={{ base: 12, md: 6 }}>
        <StandardCard component="section">
          <Box component="header">
            <Title variant="page" className="baseline-textHeroTitle">
              Reset your password
            </Title>
            <Text variant="helper">
              Enter the email address on your account and we&apos;ll send you a link to
              set a new password.
            </Text>
          </Box>
          {sent ? (
            <Stack gap="sm" mt="md">
              <Box className="status status-success" role="status">
                <Text>
                  If an account uses that address, we&apos;ve sent a link. It expires in
                  an hour.
                </Text>
              </Box>
              <Text variant="helper">
                Nothing in your inbox after a few minutes? Check your spam or junk folder.
              </Text>
            </Stack>
          ) : (
            <Box component="form" onSubmit={onSubmit} onInput={onInput} mt="md">
              <Stack gap="sm">
                <FormField
                  label="Email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  error={errors.email}
                />
                <Button type="submit" loading={loading} variant="primary">
                  {loading ? "Sending..." : "Send reset link"}
                </Button>
                <FormStatus loading={loading} result={result} />
              </Stack>
            </Box>
          )}
          <Text variant="helper" mt="md">
            <Anchor component={Link} to="/login">
              Back to sign in
            </Anchor>
          </Text>
        </StandardCard>
      </Grid.Col>
    </Grid>
  );
}
