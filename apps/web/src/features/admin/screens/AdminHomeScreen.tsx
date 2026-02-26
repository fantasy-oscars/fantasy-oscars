import { Link } from "react-router-dom";
import { Box, Divider, Group, Stack, Text, Title } from "@ui";
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
          <Stack gap="var(--fo-space-0)">
            {[
              {
                title: "Ceremonies",
                description: "Create, publish, and manage ceremony workflows.",
                to: "/admin/ceremonies"
              },
              {
                title: "Category Templates",
                description: "Define reusable category rules and metadata.",
                to: "/admin/category-templates"
              },
              {
                title: "Films",
                description: "Maintain film records and resolve duplicates.",
                to: "/admin/films"
              }
            ].map((row, idx, all) => (
              <Box key={row.to}>
                <Group justify="space-between" align="flex-start" wrap="wrap" py="sm">
                  <Box>
                    <Text
                      component={Link}
                      to={row.to}
                      fw="var(--fo-font-weight-semibold)"
                      className="baseline-textBody"
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      {row.title}
                    </Text>
                    <Text className="baseline-textBody" c="dimmed">
                      {row.description}
                    </Text>
                  </Box>
                </Group>
                {idx === all.length - 1 ? null : <Divider />}
              </Box>
            ))}
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
                Data Deletion
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
