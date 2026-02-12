import { Box, Stack, Text, Title } from "@ui";
import { Link } from "react-router-dom";
import { StandardCard } from "@/primitives";
import "@/primitives/baseline.css";
import type { CeremonyIndexRow } from "@/orchestration/ceremonies";

function yearFromIso(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return String(d.getFullYear());
}

export function CeremoniesIndexScreen(props: {
  state: "loading" | "error" | "ready";
  error: string | null;
  active: CeremonyIndexRow[];
  archived: CeremonyIndexRow[];
}) {
  const { state, error, active, archived } = props;

  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <Stack gap="md">
          <Title order={2} className="baseline-textHeroTitle">
            Ceremonies
          </Title>
          <Text className="baseline-textBody">Browse current and past ceremonies.</Text>

          {state === "loading" ? (
            <StandardCard>
              <Text className="baseline-textBody">Loading…</Text>
            </StandardCard>
          ) : state === "error" ? (
            <StandardCard>
              <Text className="baseline-textBody">
                {error ?? "Failed to load ceremonies."}
              </Text>
            </StandardCard>
          ) : (
            <Stack gap="lg">
              <Stack gap="sm">
                <Text className="baseline-textSectionHeader">Active</Text>
                <Stack gap="sm">
                  {active.map((c) => (
                    <StandardCard
                      key={c.id}
                      interactive
                      component={Link}
                      to={`/ceremonies/${c.id}`}
                    >
                      <Stack gap="var(--fo-space-dense-2)">
                        <Text className="baseline-textCardTitle">
                          {c.name?.trim() ? c.name : `Ceremony ${c.id}`}
                        </Text>
                        <Text className="baseline-textMeta">
                          {yearFromIso(c.starts_at)} · Active
                        </Text>
                      </Stack>
                    </StandardCard>
                  ))}
                </Stack>
              </Stack>

              <Stack gap="sm">
                <Text className="baseline-textSectionHeader">Archived</Text>
                {archived.length === 0 ? (
                  <Text className="baseline-textBody">No archived ceremonies yet.</Text>
                ) : (
                  <Stack gap="sm">
                    {archived.map((c) => (
                      <StandardCard
                        key={c.id}
                        interactive
                        component={Link}
                        to={`/ceremonies/${c.id}`}
                      >
                        <Stack gap="var(--fo-space-dense-2)">
                          <Text className="baseline-textCardTitle">
                            {c.name?.trim() ? c.name : `Ceremony ${c.id}`}
                          </Text>
                          <Text className="baseline-textMeta">
                            {yearFromIso(c.starts_at)} · Archived
                          </Text>
                        </Stack>
                      </StandardCard>
                    ))}
                  </Stack>
                )}
              </Stack>
            </Stack>
          )}
        </Stack>
      </Box>
    </Box>
  );
}
