import { Box, Skeleton, Stack, Title } from "@ui";
import { StandardCard } from "../primitives";
import "@/primitives/baseline.css";

export function StaticPage(props: { title: string; children: React.ReactNode }) {
  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <StandardCard>
          <Stack gap="sm">
            <Title order={2} className="baseline-textHeroTitle">
              {props.title}
            </Title>
            {props.children}
          </Stack>
        </StandardCard>
      </Box>
    </Box>
  );
}

export function StaticPageProseSkeleton() {
  return (
    <Stack gap="var(--fo-space-dense-2)" role="status" aria-label="Loading content">
      <Skeleton height="var(--fo-font-size-sm)" width="95%" />
      <Skeleton height="var(--fo-font-size-sm)" width="88%" />
      <Skeleton height="var(--fo-font-size-sm)" width="92%" />
      <Skeleton height="var(--fo-font-size-sm)" width="84%" />
      <Skeleton height="var(--fo-font-size-sm)" width="90%" />
      <Skeleton height="var(--fo-font-size-sm)" width="76%" />
    </Stack>
  );
}
