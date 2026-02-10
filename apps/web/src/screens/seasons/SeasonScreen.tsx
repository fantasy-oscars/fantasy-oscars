import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ActionIcon,
  Box,
  Button,
  Combobox,
  Divider,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  useCombobox
} from "@mantine/core";
import { allocationLabel, scoringLabel } from "../../lib/labels";
import { PageLoader } from "../../ui/page-state";
import { CommissionerPill, StatusPill } from "../../ui/pills";
import {
  computeSeasonDraftRoomCtaLabel,
  computeSeasonLocked,
  computeSeasonProgression
} from "../../decisions/season";
import "../../primitives/baseline.css";

export function SeasonScreen(props: {
  seasonIdLabel: string;
  leagueIdForBackLink?: number | null;
  view: ReturnType<typeof import("../../orchestration/seasons").useSeasonOrchestration>;
  onDeleteSeason: () => void | Promise<void>;
}) {
  const { seasonIdLabel, view: s, onDeleteSeason } = props;

  const [invitesOpen, setInvitesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [settingsDraft, setSettingsDraft] = useState<{
    scoringStrategy: "fixed" | "negative" | "category_weighted";
    allocationStrategy: "UNDRAFTED" | "FULL_POOL";
    timerEnabled: boolean;
    pickTimerSeconds: number;
  } | null>(null);

  const [weightsOpen, setWeightsOpen] = useState(false);
  const [weightsLoading, setWeightsLoading] = useState(false);
  const [weightsError, setWeightsError] = useState<string | null>(null);
  const [weightsCats, setWeightsCats] = useState<Array<{ id: number; name: string }>>([]);
  const [weightsDraft, setWeightsDraft] = useState<Record<string, number>>({});

  const leagueName = s.leagueContext?.league?.name ?? null;
  const ceremonyId = s.leagueContext?.season?.ceremony_id ?? null;
  const ceremonyName =
    s.leagueContext?.season?.ceremony_name ??
    s.leagueContext?.season?.ceremony_code ??
    (ceremonyId ? `Ceremony ${ceremonyId}` : `Ceremony`);

  const progression = useMemo(
    () => computeSeasonProgression({ isArchived: s.isArchived, draftStatus: s.draftStatus }),
    [s.draftStatus, s.isArchived]
  );

  const isLocked = useMemo(
    () => computeSeasonLocked({ isArchived: s.isArchived, draftStatus: s.draftStatus }),
    [s.draftStatus, s.isArchived]
  );

  const draftRoomCtaLabel = useMemo(
    () =>
      computeSeasonDraftRoomCtaLabel({
        ceremonyStatus: s.ceremonyStatus,
        draftStatus: s.draftStatus
      }),
    [s.ceremonyStatus, s.draftStatus]
  );

  const draftDefaults = useMemo(() => {
    const scoring = (s.scoringStrategy ?? "fixed") as
      | "fixed"
      | "negative"
      | "category_weighted";
    const allocation = (s.allocationStrategy ?? "UNDRAFTED") as "UNDRAFTED" | "FULL_POOL";
    const timerEnabled = Boolean(s.leagueContext?.season?.pick_timer_seconds);
    const pickTimerSeconds = s.leagueContext?.season?.pick_timer_seconds
      ? Number(s.leagueContext.season.pick_timer_seconds)
      : 60;

    return { scoring, allocation, timerEnabled, pickTimerSeconds };
  }, [
    s.scoringStrategy,
    s.allocationStrategy,
    s.leagueContext?.season?.pick_timer_seconds
  ]);

  if (s.loading) return <PageLoader label="Loading season..." />;
  if (s.error) {
    return (
      <Box className="baseline-page">
        <Box className="baseline-pageInner">
          <Stack component="section" gap="md">
            <Box component="header">
              <Title order={2} className="baseline-textHeroTitle">
                Season {seasonIdLabel}
              </Title>
              <Text className="baseline-textBody">Could not load season data.</Text>
            </Box>
            <Box className="status status-error">{s.error}</Box>
          </Stack>
        </Box>
      </Box>
    );
  }

  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <Stack component="section" gap="md">
          {/* Full-width header */}
          <Group
            component="header"
            justify="space-between"
            align="flex-start"
            wrap="wrap"
          >
            <Box>
              <Title order={2} className="baseline-textHeroTitle">
                {ceremonyName}
              </Title>
              <Text className="baseline-textBody">{leagueName ?? "—"}</Text>
            </Box>
            <StatusPill>{progression.toUpperCase()}</StatusPill>
          </Group>

          {/* Three-column functional layout */}
          <Box className="baseline-grid3Equal">
            {/* Column 1: Rules */}
            <Stack gap="sm">
              <Title order={3}>Rules</Title>
              <Divider />
              <Stack gap={6}>
                <Text>
                  <Text component="span" className="muted">
                    Scoring:
                  </Text>{" "}
                  {scoringLabel(s.scoringStrategy)}
                </Text>
                <Text>
                  <Text component="span" className="muted">
                    Allocation:
                  </Text>{" "}
                  {allocationLabel(s.allocationStrategy)}
                </Text>
                <Text>
                  <Text component="span" className="muted">
                    Draft timer:
                  </Text>{" "}
                  {s.leagueContext?.season?.pick_timer_seconds
                    ? `${s.leagueContext.season.pick_timer_seconds}s`
                    : "Off"}
                </Text>
                <Text>
                  <Text component="span" className="muted">
                    Ceremony time:
                  </Text>{" "}
                  {s.formatDate(s.ceremonyStartsAt)}
                </Text>
              </Stack>
            </Stack>

            {/* Column 2: Participants */}
            <Stack gap="sm">
              <Title order={3}>Participants</Title>
              <Divider />
              {s.members.length === 0 ? (
                <Text className="muted">No participants.</Text>
              ) : (
                <Stack
                  component="ul"
                  gap="xs"
                  style={{ listStyle: "none", margin: 0, padding: 0 }}
                >
                  {s.members.map((m) => (
                    <Box key={m.id} component="li">
                      <Group justify="space-between" align="center" wrap="wrap">
                        <Text>{m.username ?? `User ${m.user_id}`}</Text>
                        {m.role === "OWNER" ? <CommissionerPill /> : null}
                      </Group>
                    </Box>
                  ))}
                </Stack>
              )}
            </Stack>

            {/* Column 3: Draft room */}
            <Stack gap="sm">
              <Title order={3}>Draft room</Title>
              <Divider />
              <Group wrap="wrap">
                {s.draftId ? (
                  <Button component={Link} to={`/drafts/${s.draftId}`} variant="filled">
                    {draftRoomCtaLabel}
                  </Button>
                ) : (
                  <Button disabled variant="filled">
                    {draftRoomCtaLabel}
                  </Button>
                )}
                {ceremonyId ? (
                  <Button
                    component={Link}
                    to={`/ceremonies/${ceremonyId}/draft-plans`}
                    variant="subtle"
                  >
                    Draft plans
                  </Button>
                ) : (
                  <Button disabled variant="subtle">
                    Draft plans
                  </Button>
                )}
              </Group>
            </Stack>
          </Box>

          {/* Season management aligned under the Draft room column */}
          {s.canEdit ? (
            <Box className="baseline-grid3Equal">
              <Box />
              <Box />
              <Stack gap="sm">
                <Title order={3} className="baseline-textSectionHeader">
                  Season management
                </Title>
                <Stack gap="xs">
                  <Button
                    variant="outline"
                    onClick={() => setInvitesOpen(true)}
                    disabled={isLocked}
                    title={
                      isLocked ? "Invites are locked once drafting starts" : undefined
                    }
                  >
                    Manage invites
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSettingsDraft({
                        scoringStrategy: draftDefaults.scoring,
                        allocationStrategy: draftDefaults.allocation,
                        timerEnabled: draftDefaults.timerEnabled,
                        pickTimerSeconds: draftDefaults.pickTimerSeconds
                      });
                      setSettingsOpen(true);
                    }}
                    disabled={isLocked}
                    title={
                      isLocked
                        ? "Draft settings are locked once drafting starts"
                        : undefined
                    }
                  >
                    Adjust draft settings
                  </Button>
                </Stack>
                <Divider my="sm" />
                <Title order={4} className="baseline-textSectionHeader">
                  Danger zone
                </Title>
                <Button
                  color="red"
                  variant="outline"
                  onClick={() => setDeleteOpen(true)}
                  disabled={s.working}
                >
                  Delete season
                </Button>
              </Stack>
            </Box>
          ) : null}

          {/* Modals */}
          <Modal
            opened={invitesOpen}
            onClose={() => setInvitesOpen(false)}
            title="Manage invites"
            centered
          >
            <Stack gap="md">
              <Group className="inline-form" wrap="wrap" align="flex-end">
                <InviteUserCombobox
                  label="Username"
                  value={s.userInviteQuery}
                  disabled={!s.canEdit || s.working || isLocked}
                  searching={Boolean(s.userInviteSearching)}
                  options={s.userInviteMatches.map((u) => ({
                    id: u.id,
                    username: u.username
                  }))}
                  onChange={(next) => s.setUserInviteQuery(next)}
                  onPick={(id, username) => {
                    s.setUserInviteSelectedUserId(id);
                    s.setUserInviteQuery(username);
                  }}
                />
                <Button
                  type="button"
                  onClick={() => void s.createUserInvite()}
                  disabled={!s.canEdit || s.working || isLocked}
                >
                  Create invite
                </Button>
              </Group>

              <Group className="inline-form" wrap="wrap" align="flex-end">
                <TextInput
                  label="Placeholder invite label"
                  name="label"
                  value={s.placeholderLabel}
                  onChange={(e) => s.setPlaceholderLabel(e.currentTarget.value)}
                  disabled={!s.canEdit || s.working || isLocked}
                />
                <Button
                  type="button"
                  onClick={() => void s.createPlaceholderInvite()}
                  disabled={!s.canEdit || s.working || isLocked}
                >
                  Generate link
                </Button>
              </Group>

              {s.invites.length === 0 ? (
                <Text className="muted">No invites created yet.</Text>
              ) : (
                <Stack className="list" gap="sm">
                  {s.invites.map((invite) => (
                    <Box key={invite.id} className="list-row">
                      <Box>
                        <Group className="pill-list" wrap="wrap">
                          <Box component="span" className="pill">
                            #{invite.id}
                          </Box>
                          <Box component="span" className="pill">
                            {invite.kind}
                          </Box>
                          <Box
                            component="span"
                            className={`pill ${invite.status === "REVOKED" ? "muted" : ""}`}
                          >
                            {invite.status}
                          </Box>
                        </Group>
                        <Text className="muted">{invite.label ?? "No label"}</Text>
                        <Text className="muted">{s.buildInviteLink(invite.id)}</Text>
                      </Box>
                      <Group className="pill-actions" wrap="wrap">
                        <Button
                          type="button"
                          onClick={() => s.copyLink(invite.id)}
                          disabled={s.working}
                        >
                          Copy link
                        </Button>
                        {invite.status !== "REVOKED" ? (
                          <Button
                            type="button"
                            variant="subtle"
                            onClick={() => void s.revokeInvite(invite.id)}
                            disabled={s.working}
                          >
                            Revoke
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="subtle"
                          onClick={() => void s.regenerateInvite(invite.id)}
                          disabled={s.working}
                        >
                          Regenerate
                        </Button>
                      </Group>
                    </Box>
                  ))}
                </Stack>
              )}
            </Stack>
          </Modal>

          <Modal
            opened={settingsOpen}
            onClose={() => {
              setSettingsOpen(false);
              setSettingsDraft(null);
            }}
            title="Adjust draft settings"
            centered
          >
            <Stack gap="md">
              <Select
                label="Scoring"
                value={
                  (settingsDraft?.scoringStrategy ?? draftDefaults.scoring) as string
                }
                onChange={(v) => {
                  const next = (v ?? "fixed") as
                    | "fixed"
                    | "negative"
                    | "category_weighted";
                  setSettingsDraft((p) => ({
                    scoringStrategy: next,
                    allocationStrategy: (p?.allocationStrategy ??
                      draftDefaults.allocation) as "UNDRAFTED" | "FULL_POOL",
                    timerEnabled: p?.timerEnabled ?? draftDefaults.timerEnabled,
                    pickTimerSeconds:
                      p?.pickTimerSeconds ?? draftDefaults.pickTimerSeconds
                  }));
                }}
                disabled={!s.canEdit || s.working || isLocked}
                data={[
                  { value: "fixed", label: "Standard" },
                  { value: "negative", label: "Negative" },
                  { value: "category_weighted", label: "Category-weighted" }
                ]}
              />

              {(settingsDraft?.scoringStrategy ?? draftDefaults.scoring) ===
              "category_weighted" ? (
                <Group gap="xs" align="center">
                  <ActionIcon
                    type="button"
                    variant="subtle"
                    aria-label="Edit category weights"
                    disabled={!s.canEdit || s.working || isLocked || !ceremonyId}
                    onClick={async () => {
                      if (!ceremonyId) return;
                      setWeightsError(null);
                      setWeightsLoading(true);
                      const res = await s.getCeremonyCategoriesForWeights(ceremonyId);
                      setWeightsLoading(false);
                      if (!res.ok) {
                        setWeightsError(res.error ?? "Unable to load categories");
                        setWeightsCats([]);
                        setWeightsDraft({});
                        setWeightsOpen(true);
                        return;
                      }

                      const cats = (res.categories ?? [])
                        .slice()
                        .sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0))
                        .map((c) => ({ id: c.id, name: c.family_name }));
                      const existing =
                        (s.leagueContext?.season?.category_weights &&
                        typeof s.leagueContext.season.category_weights === "object"
                          ? s.leagueContext.season.category_weights
                          : null) ?? null;
                      const nextWeights: Record<string, number> = {};
                      for (const c of cats) {
                        const v = existing?.[String(c.id)];
                        nextWeights[String(c.id)] =
                          typeof v === "number" && Number.isInteger(v) ? v : 1;
                      }

                      setWeightsCats(cats);
                      setWeightsDraft(nextWeights);
                      setWeightsOpen(true);
                    }}
                  >
                    <Text
                      component="span"
                      className="mi-icon mi-icon-tiny"
                      aria-hidden="true"
                    >
                      settings
                    </Text>
                  </ActionIcon>
                  <Text className="baseline-textMeta" c="dimmed">
                    Category weights
                  </Text>
                  {weightsLoading ? (
                    <Text className="baseline-textMeta" c="dimmed">
                      Loading…
                    </Text>
                  ) : null}
                </Group>
              ) : null}

              <Select
                label="Allocation"
                value={
                  (settingsDraft?.allocationStrategy ??
                    draftDefaults.allocation) as string
                }
                onChange={(v) => {
                  const next = (v ?? "UNDRAFTED") as "UNDRAFTED" | "FULL_POOL";
                  setSettingsDraft((p) => ({
                    scoringStrategy: (p?.scoringStrategy ?? draftDefaults.scoring) as
                      | "fixed"
                      | "negative"
                      | "category_weighted",
                    allocationStrategy: next,
                    timerEnabled: p?.timerEnabled ?? draftDefaults.timerEnabled,
                    pickTimerSeconds:
                      p?.pickTimerSeconds ?? draftDefaults.pickTimerSeconds
                  }));
                }}
                disabled={!s.canEdit || s.working || isLocked}
                data={[
                  { value: "UNDRAFTED", label: "Leave extras undrafted" },
                  { value: "FULL_POOL", label: "Use full pool (extras drafted)" }
                ]}
              />

              <Group className="inline-form" wrap="wrap" align="flex-end">
                <Switch
                  label="Pick timer"
                  checked={settingsDraft?.timerEnabled ?? draftDefaults.timerEnabled}
                  onChange={(e) => {
                    const next = e.currentTarget.checked;
                    setSettingsDraft((p) => ({
                      scoringStrategy: (p?.scoringStrategy ?? draftDefaults.scoring) as
                        | "fixed"
                        | "negative"
                        | "category_weighted",
                      allocationStrategy: (p?.allocationStrategy ??
                        draftDefaults.allocation) as "UNDRAFTED" | "FULL_POOL",
                      timerEnabled: next,
                      pickTimerSeconds:
                        p?.pickTimerSeconds ?? draftDefaults.pickTimerSeconds
                    }));
                  }}
                  disabled={!s.canEdit || s.working || isLocked}
                />
                <NumberInput
                  label="Seconds per pick"
                  value={
                    settingsDraft?.pickTimerSeconds ?? draftDefaults.pickTimerSeconds
                  }
                  onChange={(v) => {
                    const next = Number(v) || 0;
                    setSettingsDraft((p) => ({
                      scoringStrategy: (p?.scoringStrategy ?? draftDefaults.scoring) as
                        | "fixed"
                        | "negative"
                        | "category_weighted",
                      allocationStrategy: (p?.allocationStrategy ??
                        draftDefaults.allocation) as "UNDRAFTED" | "FULL_POOL",
                      timerEnabled: p?.timerEnabled ?? draftDefaults.timerEnabled,
                      pickTimerSeconds: next
                    }));
                  }}
                  min={0}
                  step={5}
                  disabled={
                    !s.canEdit ||
                    s.working ||
                    isLocked ||
                    !(settingsDraft?.timerEnabled ?? draftDefaults.timerEnabled)
                  }
                />
              </Group>

              <Group justify="flex-end" wrap="wrap">
                <Button
                  type="button"
                  variant="subtle"
                  onClick={() => {
                    setSettingsOpen(false);
                    setSettingsDraft(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={async () => {
                    const draft = settingsDraft ?? {
                      scoringStrategy: draftDefaults.scoring,
                      allocationStrategy: draftDefaults.allocation,
                      timerEnabled: draftDefaults.timerEnabled,
                      pickTimerSeconds: draftDefaults.pickTimerSeconds
                    };

                    const nextTimerSeconds = draft.timerEnabled
                      ? draft.pickTimerSeconds
                      : null;

                    const dirty =
                      draft.scoringStrategy !== draftDefaults.scoring ||
                      draft.allocationStrategy !== draftDefaults.allocation ||
                      (draftDefaults.timerEnabled
                        ? draftDefaults.pickTimerSeconds
                        : null) !== nextTimerSeconds;

                    if (!dirty) {
                      setSettingsOpen(false);
                      setSettingsDraft(null);
                      return;
                    }

                    if (draft.scoringStrategy !== draftDefaults.scoring) {
                      await s.updateScoring(draft.scoringStrategy);
                    }
                    if (draft.allocationStrategy !== draftDefaults.allocation) {
                      await s.updateAllocation(draft.allocationStrategy);
                    }
                    await s.updateTimerWith(nextTimerSeconds);

                    setSettingsOpen(false);
                    setSettingsDraft(null);
                  }}
                  disabled={!s.canEdit || s.working || isLocked}
                >
                  Save
                </Button>
              </Group>
            </Stack>
          </Modal>

          <Modal
            opened={weightsOpen}
            onClose={() => setWeightsOpen(false)}
            title="Category weights"
            centered
          >
            <Stack gap="md">
              {weightsError ? (
                <Text className="baseline-textBody" c="red">
                  {weightsError}
                </Text>
              ) : null}

              {weightsCats.length === 0 ? (
                <Text className="baseline-textBody" c="dimmed">
                  No categories.
                </Text>
              ) : (
                <Stack gap="sm">
                  {weightsCats.map((c) => (
                    <Group key={c.id} justify="space-between" wrap="nowrap" gap="md">
                      <Text className="baseline-textBody">{c.name}</Text>
                      <NumberInput
                        value={weightsDraft[String(c.id)] ?? 1}
                        onChange={(v) => {
                          const n = Math.trunc(Number(v) || 0);
                          setWeightsDraft((prev) => ({
                            ...prev,
                            [String(c.id)]: Math.max(-99, Math.min(99, n))
                          }));
                        }}
                        min={-99}
                        max={99}
                        step={1}
                        w={120}
                      />
                    </Group>
                  ))}
                </Stack>
              )}

              <Group justify="flex-end" wrap="wrap">
                <Button variant="subtle" onClick={() => setWeightsOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={async () => {
                    await s.updateScoring("category_weighted", {
                      categoryWeights: weightsDraft
                    });
                    setWeightsOpen(false);
                  }}
                  disabled={!s.canEdit || s.working || isLocked}
                >
                  Save
                </Button>
              </Group>
            </Stack>
          </Modal>

          <Modal
            opened={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            title="Delete season?"
            centered
          >
            <Stack gap="md">
              <Text>
                Delete this season? This cancels the season and blocks drafting. This
                cannot be undone.
              </Text>
              <Group justify="flex-end">
                <Button variant="subtle" onClick={() => setDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  color="red"
                  onClick={() => {
                    setDeleteOpen(false);
                    void onDeleteSeason();
                  }}
                  disabled={s.working}
                >
                  Delete season
                </Button>
              </Group>
            </Stack>
          </Modal>
        </Stack>
      </Box>
    </Box>
  );
}

function InviteUserCombobox(props: {
  label: string;
  value: string;
  disabled: boolean;
  searching: boolean;
  options: Array<{ id: number; username: string }>;
  onChange: (next: string) => void;
  onPick: (id: number, username: string) => void;
}) {
  const { label, value, disabled, searching, options, onChange, onPick } = props;
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption()
  });

  const hasValue = Boolean(value.trim());

  return (
    <Combobox
      store={combobox}
      withinPortal={false}
      onOptionSubmit={(v) => {
        const id = Number(v);
        const picked = options.find((o) => o.id === id);
        if (!picked) return;
        onPick(picked.id, picked.username);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <TextInput
          label={label}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.currentTarget.value);
            if (!disabled) combobox.openDropdown();
          }}
          onFocus={() => {
            if (!disabled) combobox.openDropdown();
          }}
          onBlur={() => combobox.closeDropdown()}
          placeholder="Username"
          rightSection={
            searching ? (
              <Text component="span" className="baseline-textMeta" c="dimmed">
                …
              </Text>
            ) : null
          }
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options>
          {options.length === 0 ? (
            <Combobox.Empty>
              <Text className="baseline-textBody" c="dimmed">
                {hasValue ? "No matches" : "Type to search"}
              </Text>
            </Combobox.Empty>
          ) : (
            options.map((o) => (
              <Combobox.Option key={o.id} value={String(o.id)}>
                <Text className="baseline-textBody">{o.username}</Text>
              </Combobox.Option>
            ))
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
