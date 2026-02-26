import { Link } from "react-router-dom";
import { Button, Stack, Text, Title } from "@ui";
import { StandardCard } from "@/primitives";
import "@/primitives/baseline.css";

export function AdminHomeScreen(props: { isSuperAdmin: boolean }) {
  return (
    <Stack component="section" className="stack" gap="md">
      <Text className="baseline-textBody">
        Use Admin to configure ceremonies and manage user-facing content.
      </Text>

      <Stack gap="lg">
        <StandardCard>
          <Title order={3} className="baseline-textSectionHeader">
            Game Content
          </Title>
          <Text className="baseline-textBody">
            Configure ceremony data and reusable game structures.
          </Text>
          <Stack gap="xs" align="flex-start">
            <Button component={Link} to="/admin/ceremonies" variant="subtle">
              Ceremonies
            </Button>
            <Button component={Link} to="/admin/category-templates" variant="subtle">
              Category Templates
            </Button>
            <Button component={Link} to="/admin/films" variant="subtle">
              Films
            </Button>
          </Stack>
        </StandardCard>

        <StandardCard interactive component={Link} to="/admin/content">
          <Title order={3} className="baseline-textSectionHeader">
            Site &amp; Messaging
          </Title>
          <Text className="baseline-textBody">
            Edit static pages and publish announcements and banners.
          </Text>
        </StandardCard>

        {props.isSuperAdmin ? (
          <>
            <StandardCard interactive component={Link} to="/admin/users">
              <Title order={3} className="baseline-textSectionHeader">
                Users
              </Title>
              <Text className="baseline-textBody">
                Search users and manage operator/super admin access.
              </Text>
            </StandardCard>

            <StandardCard interactive component={Link} to="/admin/destructive-actions">
              <Title order={3} className="baseline-textSectionHeader">
                Critical Actions
              </Title>
              <Text className="baseline-textBody">
                Reserved for irreversible and high-impact admin operations.
              </Text>
            </StandardCard>
          </>
        ) : null}
      </Stack>
    </Stack>
  );
}
