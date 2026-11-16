import { Box, Button, Stack, Text, Title } from "@ui";
import type { ApiResult, FieldErrors } from "@/lib/types";
import { FormField, FormStatus } from "@/shared/forms";
import { StandardCard } from "@/primitives";
import "@/primitives/baseline.css";

export type AccountChangeFormProps = {
  errors: FieldErrors;
  result: ApiResult | null;
  loading: boolean;
  onInput: (e: React.FormEvent<HTMLElement>) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
};

function ChangePasswordCard(props: AccountChangeFormProps) {
  const { errors, result, loading, onInput, onSubmit } = props;
  return (
    <StandardCard component="section" aria-labelledby="account-change-password">
      <Box component="header">
        <Title order={3} variant="section" id="account-change-password">
          Change password
        </Title>
        <Text variant="helper">
          You&apos;ll stay signed in here and be signed out elsewhere.
        </Text>
      </Box>
      <Box component="form" onSubmit={onSubmit} onInput={onInput} mt="md">
        <Stack gap="sm">
          <FormField
            label="Current password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            error={errors.currentPassword}
          />
          <FormField
            label="New password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            error={errors.newPassword}
          />
          <Box>
            <Button type="submit" loading={loading} variant="primary">
              Change password
            </Button>
          </Box>
          <FormStatus loading={loading} result={result} />
        </Stack>
      </Box>
    </StandardCard>
  );
}

function ChangeEmailCard(props: AccountChangeFormProps) {
  const { errors, result, loading, onInput, onSubmit } = props;
  return (
    <StandardCard component="section" aria-labelledby="account-change-email">
      <Box component="header">
        <Title order={3} variant="section" id="account-change-email">
          Change email
        </Title>
        <Text variant="helper">Password reset links are sent to this address.</Text>
      </Box>
      <Box component="form" onSubmit={onSubmit} onInput={onInput} mt="md">
        <Stack gap="sm">
          <FormField
            label="New email"
            name="email"
            type="email"
            autoComplete="email"
            error={errors.email}
          />
          <FormField
            label="Current password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            error={errors.currentPassword}
          />
          <Box>
            <Button type="submit" loading={loading} variant="primary">
              Change email
            </Button>
          </Box>
          <FormStatus loading={loading} result={result} />
        </Stack>
      </Box>
    </StandardCard>
  );
}

/** The account page's sign-in settings: password and email, each behind the current password. */
export function AccountSecuritySection(props: {
  password: AccountChangeFormProps;
  email: AccountChangeFormProps;
}) {
  return (
    <>
      <ChangePasswordCard {...props.password} />
      <ChangeEmailCard {...props.email} />
    </>
  );
}
