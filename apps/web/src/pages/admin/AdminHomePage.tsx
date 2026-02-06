import { Link } from "react-router-dom";
import { Stack, Text, Title } from "@mantine/core";
import { StandardCard } from "../../primitives";
import "../../primitives/baseline.css";

export function AdminHomePage() {
  return (
    <Stack component="section" className="stack" gap="md">
      <Text className="baseline-textBody">
        Use Admin to configure ceremonies, manage users, publish site content, and audit
        system activity.
      </Text>

      <Stack gap="lg">
        <StandardCard interactive component={Link} to="/admin/ceremonies">
          <Title order={3} className="baseline-textSectionHeader">
            Ceremonies
          </Title>
          <Text className="baseline-textBody">
            Create and maintain ceremonies, categories, nominees, and winners.
          </Text>
        </StandardCard>

        <StandardCard interactive component={Link} to="/admin/users">
          <Title order={3} className="baseline-textSectionHeader">
            Users
          </Title>
          <Text className="baseline-textBody">Search users and manage admin access.</Text>
        </StandardCard>

        <StandardCard interactive component={Link} to="/admin/content">
          <Title order={3} className="baseline-textSectionHeader">
            Content &amp; Messaging
          </Title>
          <Text className="baseline-textBody">
            Edit static pages and publish announcements and banners.
          </Text>
        </StandardCard>

        <StandardCard interactive component={Link} to="/admin/system">
          <Title order={3} className="baseline-textSectionHeader">
            System
          </Title>
          <Text className="baseline-textBody">
            Review audit logs and system-level diagnostics.
          </Text>
        </StandardCard>
      </Stack>
    </Stack>
  );
}
