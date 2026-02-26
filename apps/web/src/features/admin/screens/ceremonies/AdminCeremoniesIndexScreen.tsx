import { Link } from "react-router-dom";
import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Group,
  Skeleton,
  Stack,
  Text,
  Title
} from "@ui";
import { FormStatus } from "@/shared/forms";
import type { ApiResult } from "@/lib/types";
import type { CeremonyOption } from "@/orchestration/adminCeremonies";
import { useState } from "react";
import { StandardCard } from "@/primitives";
import { computeAdminCeremonyIndexStatus } from "@/decisions/admin/ceremonyIndex";
import { ConfirmDeleteCeremonyModal } from "@/features/admin/ui/ceremonies/modals/ConfirmDeleteCeremonyModal";
import "@/primitives/baseline.css";

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
  onLoadDeletePreview: (
    id: number
  ) => Promise<
    | { ok: true; preview: { ceremonyName: string; seasonsRemoved: number } }
    | { ok: false; error: string }
  >;
}) {
  const { state, error, ceremonies, creating, workingId, status, onCreate, onDelete } =
    props;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmCeremonyName, setConfirmCeremonyName] = useState("Ceremony");
  const [confirmSeasonsRemoved, setConfirmSeasonsRemoved] = useState(0);

  if (state === "loading")
    return (
      <Stack component="section" gap="md" role="status" aria-label="Loading ceremonies">
        <Box component="header" className="admin-page-header">
          <Skeleton height="var(--fo-font-size-hero-title)" width="28%" />
          <Skeleton height="var(--fo-font-size-sm)" width="62%" />
          <Skeleton height="36px" width="140px" />
        </Box>
        <Divider />
        <Skeleton height="var(--fo-font-size-sm)" width="24%" />
        <Stack gap="sm">
          {Array.from({ length: 5 }).map((_, idx) => (
            <StandardCard key={idx}>
              <Group justify="space-between" align="center" wrap="nowrap">
                <Stack gap="var(--fo-space-4)" className="fo-flex1Minw0">
                  <Skeleton height="var(--fo-font-size-sm)" width="48%" />
                  <Skeleton height="22px" width="110px" />
                </Stack>
                <Group gap="xs" wrap="nowrap">
                  <Skeleton height="30px" width="30px" />
                  <Skeleton height="30px" width="30px" />
                  <Skeleton height="30px" width="30px" />
                </Group>
              </Group>
            </StandardCard>
          ))}
        </Stack>
      </Stack>
    );
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
            const deleting = workingId === c.id;

            return (
              <StandardCard key={c.id}>
                <Group
                  justify="space-between"
                  align="center"
                  wrap="nowrap"
                  gap="var(--fo-space-dense-2)"
                >
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
                      onClick={async () => {
                        if (isArchived || deleting) return;
                        setConfirmLoading(true);
                        setConfirmError(null);
                        const preview = await props.onLoadDeletePreview(c.id);
                        setConfirmLoading(false);
                        if (!preview.ok) {
                          setConfirmError(preview.error);
                          setConfirmCeremonyName(c.name || "Ceremony");
                          setConfirmSeasonsRemoved(0);
                          setConfirmId(c.id);
                          setConfirmOpen(true);
                          return;
                        }
                        setConfirmCeremonyName(preview.preview.ceremonyName);
                        setConfirmSeasonsRemoved(preview.preview.seasonsRemoved);
                        setConfirmId(c.id);
                        setConfirmOpen(true);
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
        ceremonyName={confirmCeremonyName}
        seasonsRemoved={confirmSeasonsRemoved}
        loading={confirmLoading || (confirmId ? workingId === confirmId : false)}
        error={confirmError}
        onConfirm={() => {
          if (confirmId) onDelete(confirmId);
          setConfirmOpen(false);
          setConfirmId(null);
        }}
      />
    </Stack>
  );
}
