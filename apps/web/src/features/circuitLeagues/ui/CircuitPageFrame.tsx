import type { ReactNode } from "react";
import { Box, Group, Skeleton, Stack, Text, Title } from "@ui";
import { PageError } from "@/shared/page-state";
import { StandardCard } from "@/primitives";
import "@/primitives/baseline.css";

/** Page shell shared by a season's roster and transaction screens. */
export function CircuitPageFrame(props: {
  title: string;
  subtitle: ReactNode;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <Stack component="section" gap="md">
          <Group
            component="header"
            justify="space-between"
            align="flex-start"
            wrap="wrap"
          >
            <Stack gap="var(--fo-space-dense-2)" miw="var(--fo-space-0)">
              <Title order={2} className="baseline-textHeroTitle baseline-wrapAnywhere">
                {props.title}
              </Title>
              <Text className="baseline-textBody baseline-wrapAnywhere">
                {props.subtitle}
              </Text>
            </Stack>
            <Group gap="sm" wrap="wrap">
              {props.actions}
            </Group>
          </Group>
          {props.children}
        </Stack>
      </Box>
    </Box>
  );
}

export function CircuitPageSkeleton(props: {
  label: string;
  /** A view switch's block above the card (screens with views). */
  withSwitch?: boolean;
  rows?: number;
}) {
  return (
    <Box className="baseline-page" role="status" aria-label={props.label}>
      <Box className="baseline-pageInner">
        <Stack component="section" gap="md">
          <Skeleton height="var(--fo-font-size-hero-title)" width="44%" />
          {props.withSwitch ? (
            <Skeleton height="var(--fo-control-height)" width="18rem" maw="100%" />
          ) : null}
          <StandardCard>
            <Stack gap="sm">
              {Array.from({ length: props.rows ?? 4 }).map((_, idx) => (
                <Skeleton key={idx} height="var(--fo-font-size-sm)" width="72%" />
              ))}
            </Stack>
          </StandardCard>
        </Stack>
      </Box>
    </Box>
  );
}

export function CircuitPageError(props: {
  title: string;
  notFound: boolean;
  message: string;
  requestId?: string;
}) {
  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <Stack component="section" gap="md">
          <Box component="header">
            <Title order={2} className="baseline-textHeroTitle">
              {props.title}
            </Title>
            <Text className="baseline-textBody">
              {props.notFound ? "Season not found." : "Unable to load"}
            </Text>
          </Box>
          <PageError message={props.message} requestId={props.requestId} />
        </Stack>
      </Box>
    </Box>
  );
}
