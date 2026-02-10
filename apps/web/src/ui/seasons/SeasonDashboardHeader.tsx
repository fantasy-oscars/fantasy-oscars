import { Box, Group, Text, Title } from "@mantine/core";
import { StatusPill } from "../pills";

export function SeasonDashboardHeader(props: {
  title: string;
  subtitle: string;
  statusLabel: string;
}) {
  const { title, subtitle, statusLabel } = props;
  return (
    <Group component="header" justify="space-between" align="flex-start" wrap="wrap">
      <Box>
        <Title order={2} className="baseline-textHeroTitle">
          {title}
        </Title>
        <Text className="baseline-textBody">{subtitle}</Text>
      </Box>
      <StatusPill>{statusLabel}</StatusPill>
    </Group>
  );
}

