import { Box, Stack, Title } from "@ui";
import type { SitePage } from "@/content/sitePages";
import { Markdown } from "@ui/Markdown";
import { StandardCard } from "@/primitives";
import "@/primitives/baseline.css";

export function AboutScreen(props: { page: SitePage }) {
  const { page } = props;

  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <StandardCard>
          <Stack gap="sm">
            <Title variant="page">{page.title}</Title>
            <Markdown tree={page.tree} />
          </Stack>
        </StandardCard>
      </Box>
    </Box>
  );
}
