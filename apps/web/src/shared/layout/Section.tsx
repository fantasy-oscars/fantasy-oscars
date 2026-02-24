import type { PropsWithChildren, ReactNode } from "react";
import { Box, Divider, Stack, Title } from "@ui";

export function Section(
  props: PropsWithChildren<{ title?: ReactNode; withDivider?: boolean }>
) {
  return (
    <Stack gap="var(--fo-space-0)">
      {props.title ? (
        <Title order={3} className="baseline-textSectionHeader">
          {props.title}
        </Title>
      ) : null}
      {props.withDivider ? <Divider my="sm" /> : null}
      <Box>{props.children}</Box>
    </Stack>
  );
}
