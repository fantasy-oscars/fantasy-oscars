import type { ReactNode } from "react";
import { Box, Group, Stack, Text, Title } from "@ui";

export function PageHeader(props: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <Box component="header">
      <Stack gap="var(--fo-space-4)">
        <Group justify="space-between" gap="sm" wrap="nowrap">
          <Title order={2} className="baseline-textHeroTitle">
            {props.title}
          </Title>
          {props.right ? <Box>{props.right}</Box> : null}
        </Group>
        {props.subtitle ? <Text className="baseline-textBody">{props.subtitle}</Text> : null}
      </Stack>
    </Box>
  );
}
