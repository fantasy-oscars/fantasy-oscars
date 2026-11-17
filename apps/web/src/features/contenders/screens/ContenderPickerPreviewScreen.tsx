import { Box, Stack, Text, Title } from "@ui";
import { StandardCard } from "@/primitives";
import "@/primitives/baseline.css";
import { ContenderPicker, type ContenderPickerProps } from "../ui/ContenderPicker";

/**
 * The contender picker on its own, for operators to try against a Circuit
 * before a player screen mounts it. Picks made here are real selections:
 * they say a contender exists and carry no ownership.
 */
export function ContenderPickerPreviewScreen(props: ContenderPickerProps) {
  return (
    <Stack component="section" gap="md">
      <Box component="header" className="admin-page-header">
        <Title order={2} className="baseline-textHeroTitle">
          Contender picker
        </Title>
        <Text className="baseline-textBody" c="dimmed">
          Players pick a category, then a film, then a person for acting categories. A
          pick here adds the contender to this Circuit for every league.
        </Text>
      </Box>
      <StandardCard aria-label="Pick a contender">
        <ContenderPicker {...props} />
      </StandardCard>
    </Stack>
  );
}
