import { Link } from "react-router-dom";
import { Box, Button, Card, Group, Stack, Text, Title } from "@mantine/core";

export function AdminContentHomePage() {
  return (
    <Stack component="section" className="stack">
      <Card className="card nested" component="section">
        <Box component="header">
          <Title order={3}>Static Content (live)</Title>
          <Text className="muted">
            Changes apply immediately. Use for evergreen pages like About/FAQ and legal
            copy.
          </Text>
        </Box>

        <Box className="grid two-col">
          <Card className="card nested">
            <Title order={4}>Landing</Title>
            <Text className="muted">Short blurb at the top of the landing page.</Text>
            <Group className="inline-actions" mt="sm" wrap="wrap">
              <Button
                component={Link}
                to="/admin/content/static/landing_blurb"
                variant="subtle"
              >
                Edit landing blurb
              </Button>
            </Group>
          </Card>

          <Card className="card nested">
            <Title order={4}>Site Pages</Title>
            <Text className="muted">Evergreen pages shown in the main nav/footer.</Text>
            <Group className="inline-actions" mt="sm" wrap="wrap">
              <Button component={Link} to="/admin/content/static/about" variant="subtle">
                Edit About
              </Button>
              <Button
                component={Link}
                to="/admin/content/static/how_it_works"
                variant="subtle"
              >
                Edit How It Works
              </Button>
              <Button component={Link} to="/admin/content/static/faq" variant="subtle">
                Edit FAQ
              </Button>
            </Group>
          </Card>

          <Card className="card nested">
            <Title order={4}>Legal</Title>
            <Text className="muted">Live legal copy.</Text>
            <Group className="inline-actions" mt="sm" wrap="wrap">
              <Button
                component={Link}
                to="/admin/content/static/code_of_conduct"
                variant="subtle"
              >
                Edit Code of Conduct
              </Button>
              <Button
                component={Link}
                to="/admin/content/static/legal_terms"
                variant="subtle"
              >
                Edit Terms
              </Button>
              <Button
                component={Link}
                to="/admin/content/static/legal_privacy"
                variant="subtle"
              >
                Edit Privacy
              </Button>
              <Button
                component={Link}
                to="/admin/content/static/legal_disclaimer"
                variant="subtle"
              >
                Edit Disclaimer
              </Button>
            </Group>
          </Card>
        </Box>
      </Card>

      <Card className="card nested" component="section">
        <Box component="header">
          <Title order={3}>Dynamic Content (publish)</Title>
          <Text className="muted">
            Draft, review, and publish. Treat these like blog entries with a
            ledger/history.
          </Text>
        </Box>

        <Box className="grid two-col">
          <Card className="card nested">
            <Title order={4}>Home main body</Title>
            <Text className="muted">The longer prose block on the landing page.</Text>
            <Group className="inline-actions" mt="sm" wrap="wrap">
              <Button
                component={Link}
                to="/admin/content/dynamic/home_main"
                variant="subtle"
              >
                Manage entries
              </Button>
            </Group>
          </Card>

          <Card className="card nested">
            <Title order={4}>Banner</Title>
            <Text className="muted">A short in-app banner message.</Text>
            <Group className="inline-actions" mt="sm" wrap="wrap">
              <Button
                component={Link}
                to="/admin/content/dynamic/banner"
                variant="subtle"
              >
                Manage entries
              </Button>
            </Group>
          </Card>
        </Box>
      </Card>
    </Stack>
  );
}
