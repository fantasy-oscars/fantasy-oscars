import { Box, Stack, Title } from "@mantine/core";
import { StandardCard } from "../primitives";
import "../primitives/baseline.css";

export function StaticPage(props: { title: string; children: React.ReactNode }) {
  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <StandardCard>
          <Stack gap="sm">
            <Title order={2} className="baseline-textHeroTitle">
              {props.title}
            </Title>
            {props.children}
          </Stack>
        </StandardCard>
      </Box>
    </Box>
  );
}
