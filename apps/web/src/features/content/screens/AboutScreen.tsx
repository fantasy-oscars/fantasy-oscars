import { Box, Stack, Text, Title } from "@ui";
import type { StaticContentView } from "@/orchestration/content";
import { Markdown } from "@ui/Markdown";
import { StandardCard } from "@/primitives";
import "@/primitives/baseline.css";

export function AboutScreen(props: { title: string; view: StaticContentView }) {
  const { title, view } = props;

  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <StandardCard>
          <Stack gap="sm">
            <Title variant="page">{view.state === "ready" ? view.content.title : title}</Title>
            {view.state === "loading" ? (
              <Text>Loading…</Text>
            ) : view.state === "error" ? (
              <Text>{view.message}</Text>
            ) : (
              <Markdown markdown={view.content.body_markdown} />
            )}
          </Stack>
        </StandardCard>
      </Box>
    </Box>
  );
}
