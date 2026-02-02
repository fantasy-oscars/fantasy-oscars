import { Box, Card, Title } from "@mantine/core";

export function StaticPage(props: { title: string; children: React.ReactNode }) {
  return (
    <Card className="card" component="section">
      <Box component="header">
        <Title order={2}>{props.title}</Title>
      </Box>
      <Box className="prose">{props.children}</Box>
    </Card>
  );
}
