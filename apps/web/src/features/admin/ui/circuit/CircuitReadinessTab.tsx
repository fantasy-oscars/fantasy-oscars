import { Box, Stack, Text, Title } from "@ui";
import { EmptyState } from "@/primitives";
import {
  coverageRows,
  readinessIconFlags,
  readinessTodos
} from "@/decisions/admin/circuitReadiness";
import type { CircuitReadiness } from "@/orchestration/adminCircuit";

/**
 * Read-only. First what still blocks the Circuit (dates, mappings), then for
 * each ceremony the Circuit categories it supplies and its categories that
 * map to nothing. Mappings are edited on the Ceremonies tab and dates on each
 * ceremony's admin page. Category icon flags follow; they never block, and
 * icons are changed on the Categories tab.
 */
export function CircuitReadinessTab(props: { readiness: CircuitReadiness | null }) {
  const { readiness } = props;
  if (!readiness) {
    return <EmptyState>The readiness report could not be loaded.</EmptyState>;
  }
  const todos = readinessTodos(readiness);
  const rows = coverageRows(readiness);
  const iconFlags = readinessIconFlags(readiness);

  return (
    <Stack gap="md">
      {readiness.ready ? (
        <Box className="status status-success">
          Ready: every ceremony has its dates and supplies a category, and every category
          has a ceremony.
        </Box>
      ) : (
        <Box className="status status-warning">
          <Stack gap="var(--fo-space-4)">
            <Text fw="var(--fo-font-weight-bold)">
              {rows.length === 0 ? "Not ready yet: add a ceremony." : "Not ready yet:"}
            </Text>
            <Stack component="ul" gap="var(--fo-space-2)" className="fo-listReset">
              {todos.map((t) => (
                <Text key={t.key} component="li">
                  {t.text}
                </Text>
              ))}
            </Stack>
          </Stack>
        </Box>
      )}

      <Box component="section" aria-labelledby="circuit-icons-title">
        <Title order={4} variant="section" id="circuit-icons-title">
          Category icons
        </Title>
        {iconFlags.length === 0 ? (
          <Text className="muted">Every category has its own icon.</Text>
        ) : (
          <Stack gap="var(--fo-space-4)" mt="sm">
            <Text className="muted">
              Season pills show a category only by its icon. Change icons on the
              Categories tab.
            </Text>
            <Stack component="ul" gap="var(--fo-space-2)" className="fo-listReset">
              {iconFlags.map((f) => (
                <Text key={f.key} component="li">
                  {f.text}
                </Text>
              ))}
            </Stack>
          </Stack>
        )}
      </Box>

      <Box component="section" aria-labelledby="circuit-coverage-title">
        <Title order={4} variant="section" id="circuit-coverage-title">
          Coverage
        </Title>
        <Text className="muted">
          The Circuit categories each ceremony supplies, and its categories that are
          mapped to none.
        </Text>
        {rows.length === 0 ? (
          <Box mt="sm">
            <EmptyState>No ceremonies yet.</EmptyState>
          </Box>
        ) : (
          <Stack component="ul" gap="md" mt="sm" className="fo-listReset">
            {rows.map((row) => (
              <Box key={row.ceremonyId} component="li">
                <Text fw="var(--fo-font-weight-bold)">{row.label}</Text>
                <Text>
                  {row.supplies.length === 0
                    ? "Supplies no Circuit category."
                    : `Supplies: ${row.supplies
                        .map((s) =>
                          s.editions > 1 ? `${s.name} (${s.editions})` : s.name
                        )
                        .join(", ")}`}
                </Text>
                {row.unmapped.length > 0 ? (
                  <Text className="muted" size="sm">
                    Not mapped: {row.unmapped.map((e) => e.name).join(", ")}
                  </Text>
                ) : null}
              </Box>
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
