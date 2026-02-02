import { Box, Card, Text, Title } from "@mantine/core";
import { ResultsPage } from "./ResultsPage";

export function CeremoniesPage() {
  return (
    <Card className="card" component="section">
      <Box component="header">
        <Title order={2}>Ceremonies</Title>
        <Text className="muted">
          Active ceremony winners and draft standings. (MVP: uses a selected draft to
          compute standings.)
        </Text>
      </Box>
      <ResultsPage />
    </Card>
  );
}
