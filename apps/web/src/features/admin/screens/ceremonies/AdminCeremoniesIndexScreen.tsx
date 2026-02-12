import { Link } from "react-router-dom";
import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Group,
  Stack,
  Text,
  Title
} from "@ui";
import { FormStatus } from "@/shared/forms";
import { PageLoader } from "@/shared/page-state";
import type { ApiResult } from "@/lib/types";
import type { CeremonyOption } from "@/orchestration/adminCeremonies";
import { useState } from "react";
import { StandardCard } from "@/primitives";
import {
  computeAdminCeremonyDeletePolicy,
  computeAdminCeremonyIndexStatus
} from "@/decisions/admin/ceremonyIndex";
import { ConfirmDeleteCeremonyModal } from "@/features/admin/ui/ceremonies/modals/ConfirmDeleteCeremonyModal";
import "../../../primitives/baseline.css";

const ICON_VISIBILITY = "visibility";
const ICON_EDIT = "edit";
const ICON_DELETE = "delete";

export function AdminCeremoniesIndexScreen(props: {
  state: "loading" | "error" | "ready";
  error: string | null;
  ceremonies: CeremonyOption[];
  creating: boolean;
  workingId: number | null;
  status: ApiResult | null;
  onCreate: () => void;
  onDelete: (id: number) => void;
}) {
  const { state, error, ceremonies, creating, workingId, status, onCreate, onDelete } =
    props;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  if (state === "loading") return <PageLoader label="Loading ceremonies..." />;
  if (state === "error")
    return (
      <Box className="status status-error">{error ?? "Unable to load ceremonies"}</Box>
    );

  return (
    <Stack component="section" gap="md">
      <Box component="header" className="admin-page-header">
        <Title order={2} className="baseline-textHeroTitle">
          Ceremonies
        </Title>
        <Text className="baseline-textBody" c="dimmed">
          Ceremonies define draftable events (like awards shows) that seasons can be
          created against.
        </Text>
        <Button type="button" onClick={onCreate} disabled={creating}>
          {creating ? "Creating..." : "New ceremony"}
        </Button>
        <FormStatus loading={creating} result={status} />
      </Box>

      <Divider />

      <Title order={3} className="baseline-textSectionHeader">
        Your ceremonies
      </Title>

      {ceremonies.length === 0 ? (
        <StandardCard>
          <Text fw="var(--fo-font-weight-bold)" className="baseline-textBody">
            No ceremonies exist yet.
          </Text>
          <Text className="baseline-textBody" c="dimmed" mt="xs">
            A ceremony defines the draftable event that leagues and seasons are built
            around.
          </Text>
          <Button type="button" onClick={onCreate} disabled={creating} mt="md">
            {creating ? "Creating..." : "Create your first ceremony"}
          </Button>
        </StandardCard>
      ) : (
        <Stack gap="sm">
          {ceremonies.map((c) => {
            const { statusUpper, isArchived } = computeAdminCeremonyIndexStatus({
              status: c.status
            });
            const { needsConfirm } = computeAdminCeremonyDeletePolicy({ status: c.status });
            const deleting = workingId === c.id;

            return (
              <StandardCard key={c.id}>
                <Group justify="space-between" align="center" wrap="nowrap" gap="var(--fo-space-dense-2)">
                  <Group gap="sm" align="center" wrap="nowrap" miw="var(--fo-space-0)">
                    <Box miw="var(--fo-space-0)">
                      <Text
                        fw="var(--fo-font-weight-bold)"
                        component={Link}
                        to={`/admin/ceremonies/${c.id}`}
                        className="link-plain fo-block"
                        lineClamp={1}
                      >
                        {c.name || "Untitled ceremony"}
                      </Text>
                    </Box>
                    <Box component="span" className="baseline-statusPill">
                      <Text
                        className="baseline-textMeta fo-letterSpacingTracked"
                        fw="var(--fo-font-weight-bold)"
                      >
                        {statusUpper}
                      </Text>
                    </Box>
                  </Group>

                  <Group gap="xs" align="center" wrap="nowrap">
                    <ActionIcon
                      component="a"
                      // Open via the admin route first so deployments that only rewrite /admin/*
                      // still reach the SPA, then client-side redirect into the chrome-less draft layout.
                      href={`/admin/ceremonies/${c.id}/preview`}
                      target="_blank"
                      rel="noreferrer"
                      variant="subtle"
                      aria-label="Preview draft board"
                    >
                      <Text component="span" className="gicon" aria-hidden="true">
                        {ICON_VISIBILITY}
                      </Text>
                    </ActionIcon>
                    <ActionIcon
                      component={Link}
                      to={`/admin/ceremonies/${c.id}`}
                      variant="subtle"
                      aria-label="Edit ceremony"
                    >
                      <Text component="span" className="gicon" aria-hidden="true">
                        {ICON_EDIT}
                      </Text>
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      aria-label="Delete ceremony"
                      disabled={isArchived || deleting}
                      onClick={() => {
                        if (isArchived || deleting) return;
                        if (needsConfirm) {
                          setConfirmId(c.id);
                          setConfirmOpen(true);
                          return;
                        }
                        onDelete(c.id);
                      }}
                    >
                      <Text component="span" className="gicon" aria-hidden="true">
                        {ICON_DELETE}
                      </Text>
                    </ActionIcon>
                  </Group>
                </Group>
              </StandardCard>
            );
          })}
        </Stack>
      )}

      <ConfirmDeleteCeremonyModal
        opened={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          if (confirmId) onDelete(confirmId);
          setConfirmOpen(false);
          setConfirmId(null);
        }}
      />
    </Stack>
  );
}
