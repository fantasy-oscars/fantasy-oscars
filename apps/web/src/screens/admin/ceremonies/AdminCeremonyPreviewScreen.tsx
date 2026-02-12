import { Box, Stack, Text, Title } from "@ui";
import { DraftBoardGrid } from "../../../components/draft/DraftBoardGrid";

export function AdminCeremonyPreviewScreen(props: {
  categories: Array<{
    id: number;
    title: string;
    icon: string;
    nominations: Array<{ id: number; label: string; muted: boolean; selected: boolean }>;
    emptyText: string | null;
  }>;
}) {
  const { categories } = props;
  return (
    <Stack className="stack-lg" gap="lg">
      <Box component="header">
        <Title order={2}>Draft Board (Preview)</Title>
        <Text className="muted">Admin-only · Changes here do not affect users</Text>
      </Box>

      <DraftBoardGrid categories={categories} selectable={false} />
    </Stack>
  );
}
