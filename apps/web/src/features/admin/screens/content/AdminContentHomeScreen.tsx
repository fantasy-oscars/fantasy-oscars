import { Link } from "react-router-dom";
import { Box, Button, Divider, Group, Stack, Text, Title } from "@ui";
import "../../../primitives/baseline.css";

export function AdminContentHomeScreen() {
  return (
    <Stack component="section" className="stack">
      <Title order={4} className="baseline-textSectionHeader">
        Landing page
      </Title>
      <Stack gap="var(--fo-space-0)">
        {[
          {
            title: "Hero",
            description: "The hero card at the top of the Home page (title + tagline).",
            action: "Edit",
            to: "/admin/content/static/landing_blurb"
          },
          {
            title: "Home main body",
            description: "Exactly one entry is shown on the landing page at a time.",
            action: "Open",
            to: "/admin/content/dynamic/home_main"
          }
        ].map((row, idx, all) => (
          <Box key={row.to}>
            <Group justify="space-between" align="flex-start" wrap="wrap" py="sm">
              <Box>
                <Text fw="var(--fo-font-weight-semibold)" className="baseline-textBody">
                  {row.title}
                </Text>
                <Text className="baseline-textBody" c="dimmed">
                  {row.description}
                </Text>
              </Box>
              <Button component={Link} to={row.to} variant="subtle">
                {row.action}
              </Button>
            </Group>
            {idx === all.length - 1 ? null : <Divider />}
          </Box>
        ))}
      </Stack>

      <Divider my="md" />

      <Title order={3} className="baseline-textSectionHeader">
        Site Pages
      </Title>
      <Stack gap="var(--fo-space-0)">
        {[
          {
            label: "About",
            description: "Single-page site content shown under About.",
            to: "/admin/content/static/about"
          },
          {
            label: "How It Works",
            description: "Single-page site content shown under How It Works.",
            to: "/admin/content/static/how_it_works"
          },
          {
            label: "FAQ",
            description: "Single-page site content shown under FAQ.",
            to: "/admin/content/static/faq"
          }
        ].map((row, idx, all) => (
          <Box key={row.to}>
            <Group justify="space-between" align="flex-start" wrap="wrap" py="sm">
              <Box>
                <Text fw="var(--fo-font-weight-semibold)" className="baseline-textBody">
                  {row.label}
                </Text>
                <Text className="baseline-textBody" c="dimmed">
                  {row.description}
                </Text>
              </Box>
              <Button component={Link} to={row.to} variant="subtle">
                Edit
              </Button>
            </Group>
            {idx === all.length - 1 ? null : <Divider />}
          </Box>
        ))}
      </Stack>

      <Divider my="md" />

      <Title order={3} className="baseline-textSectionHeader">
        Announcements &amp; Messaging
      </Title>
      <Stack gap="var(--fo-space-0)">
        {[
          {
            label: "Banner messages",
            description: "Multiple banners may be shown at the same time.",
            to: "/admin/content/dynamic/banner",
            action: "Open"
          }
        ].map((row, idx, all) => (
          <Box key={row.to}>
            <Group justify="space-between" align="flex-start" wrap="wrap" py="sm">
              <Box>
                <Text fw="var(--fo-font-weight-semibold)" className="baseline-textBody">
                  {row.label}
                </Text>
                <Text className="baseline-textBody" c="dimmed">
                  {row.description}
                </Text>
              </Box>
              <Button component={Link} to={row.to} variant="subtle">
                {row.action}
              </Button>
            </Group>
            {idx === all.length - 1 ? null : <Divider />}
          </Box>
        ))}
      </Stack>

      <Divider my="md" />

      <Title
        order={3}
        className="baseline-textSectionHeader fo-opacityMuted2"
      >
        Legal
      </Title>
      <Stack gap="var(--fo-space-0)" className="fo-opacityMuted1">
        {[
          {
            label: "Code of Conduct",
            description: "Legal page shown under Code of Conduct.",
            to: "/admin/content/static/code_of_conduct"
          },
          {
            label: "Terms",
            description: "Legal page shown under Terms.",
            to: "/admin/content/static/legal_terms"
          },
          {
            label: "Privacy",
            description: "Legal page shown under Privacy.",
            to: "/admin/content/static/legal_privacy"
          },
          {
            label: "Disclaimer",
            description: "Legal page shown under Disclaimer.",
            to: "/admin/content/static/legal_disclaimer"
          }
        ].map((row, idx, all) => (
          <Box key={row.to}>
            <Group justify="space-between" align="flex-start" wrap="wrap" py="sm">
              <Box>
                <Text fw="var(--fo-font-weight-semibold)" className="baseline-textBody">
                  {row.label}
                </Text>
                <Text className="baseline-textBody" c="dimmed">
                  {row.description}
                </Text>
              </Box>
              <Button component={Link} to={row.to} variant="subtle">
                Edit
              </Button>
            </Group>
            {idx === all.length - 1 ? null : <Divider />}
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}
