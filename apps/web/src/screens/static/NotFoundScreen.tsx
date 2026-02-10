import { Link } from "react-router-dom";
import { Box, Button, Stack, Text, Title } from "@mantine/core";
import { StandardCard } from "../../primitives";
import "../../primitives/baseline.css";

export function NotFoundScreen() {
  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <StandardCard component="section">
          <Stack gap="md">
            <Box component="header">
              <Title order={2} className="baseline-textHeroTitle">
                Not found
              </Title>
              <Text className="baseline-textBody">That page does not exist.</Text>
            </Box>
            <Button component={Link} to="/" variant="outline">
              Go to home
            </Button>
          </Stack>
        </StandardCard>
      </Box>
    </Box>
  );
}
