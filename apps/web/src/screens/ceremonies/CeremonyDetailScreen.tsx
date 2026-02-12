import { Box, Button, Divider, Group, Stack, Text, Title } from "@ui";
import { PageError, PageLoader } from "../../ui/page-state";
import type { CeremonyDetail } from "../../orchestration/ceremonies";
import { Link } from "react-router-dom";
import { StandardCard } from "../../primitives";
import "../../primitives/baseline.css";

export function CeremonyDetailScreen(props: {
  state: "loading" | "error" | "ready";
  error: string | null;
  detail: CeremonyDetail | null;
}) {
  if (props.state === "loading") return <PageLoader label="Loading ceremony..." />;
  if (props.state === "error")
    return <PageError message={props.error ?? "Failed to load"} />;
  if (!props.detail) return <PageError message="Ceremony not found" />;

  const { ceremony, categories, nominations, winners } = props.detail;
  const winnersSet = new Set(winners.map((w) => w.nomination_id));

  const nominationsByCategory = new Map<number, typeof nominations>();
  for (const n of nominations) {
    const bucket = nominationsByCategory.get(n.category_edition_id) ?? [];
    bucket.push(n);
    nominationsByCategory.set(n.category_edition_id, bucket);
  }

  const label =
    ceremony.name?.trim() || ceremony.code?.trim() || `Ceremony #${ceremony.id}`;

  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <StandardCard component="section">
          <Stack gap="lg">
            <Group
              component="header"
              justify="space-between"
              align="flex-start"
              wrap="wrap"
              gap="md"
            >
              <Box>
                <Title order={2} className="baseline-textHeroTitle">
                  {label}
                </Title>
                <Text className="baseline-textBody">
                  Nominees and winners for this ceremony.
                </Text>
              </Box>
              <Button
                component={Link}
                to={`/ceremonies/${ceremony.id}/draft-plans`}
                variant="outline"
              >
                Draft plans
              </Button>
            </Group>

            <Stack gap="md">
              {categories
                .slice()
                .sort((a, b) => a.sort_index - b.sort_index || a.id - b.id)
                .map((cat) => {
                  const rows = nominationsByCategory.get(cat.id) ?? [];
                  return (
                    <Box key={cat.id}>
                      <Group justify="space-between" align="baseline" wrap="wrap">
                        <Title order={4} className="baseline-textSectionHeader">
                          {cat.family_name}
                        </Title>
                      </Group>
                      <Divider my="xs" />
                      {rows.length === 0 ? (
                        <Text className="baseline-textBody">No nominees.</Text>
                      ) : (
                        <Stack gap="var(--fo-space-8)">
                          {rows.map((n) => {
                            const isWinner = winnersSet.has(n.id);
                            return (
                              <Group
                                key={n.id}
                                justify="space-between"
                                wrap="wrap"
                                gap="md"
                              >
                                <Text
                                  fw={isWinner ? 700 : 400}
                                  lineClamp={2}
                                  className="baseline-textBody"
                                >
                                  {n.label}
                                </Text>
                                {isWinner ? (
                                  <Text
                                    component="span"
                                    className="gicon"
                                    aria-label="Winner"
                                    title="Winner"
                                    opacity="var(--fo-opacity-muted-1)"
                                  >
                                    {String.fromCharCode(0xe838) /* emoji_events */}
                                  </Text>
                                ) : null}
                              </Group>
                            );
                          })}
                        </Stack>
                      )}
                    </Box>
                  );
                })}
            </Stack>
          </Stack>
        </StandardCard>
      </Box>
    </Box>
  );
}
