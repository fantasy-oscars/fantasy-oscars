import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Group, Select, Stack, Text, Title } from "@ui";
import { StandardCard } from "@/primitives";
import { fetchJson } from "@/lib/api";
import { ceremonyCodeSlug, leaguePath, seasonPath, slugifyPathSegment } from "@/lib/routes";
import { notify } from "@/notifications";
import {
  DestructiveActionModal,
  type DestructiveConsequence
} from "@/shared/modals/DestructiveActionModal";
import "@/primitives/baseline.css";

type DeleteEntity = "ceremony" | "season" | "league";

type DeleteModalState = {
  entity: DeleteEntity;
  id: number;
  title: string;
  summary: string;
  consequences: DestructiveConsequence[];
  contextLinks?: Array<{ label: string; href: string }>;
};

export function AdminSafeguardsScreen() {
  const [ceremonyOptions, setCeremonyOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [seasonOptions, setSeasonOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [leagueOptions, setLeagueOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);

  const [ceremonySelectedId, setCeremonySelectedId] = useState<string | null>(null);
  const [seasonSelectedId, setSeasonSelectedId] = useState<string | null>(null);
  const [leagueSelectedId, setLeagueSelectedId] = useState<string | null>(null);

  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState<DeleteEntity | null>(null);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modal, setModal] = useState<DeleteModalState | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadAllOptions() {
      setLoadingLists(true);
      const [ceremoniesRes, seasonsRes, leaguesRes] = await Promise.all([
        fetchJson<{
          ceremonies: Array<{
            id: number;
            code: string;
            name: string;
            year?: number | null;
          }>;
        }>("/admin/ceremonies", { method: "GET" }),
        fetchJson<{
          seasons: Array<{
            id: number;
            league_name: string;
            ceremony_name: string;
            ceremony_code: string | null;
          }>;
        }>("/admin/seasons/search", { method: "GET" }),
        fetchJson<{ leagues: Array<{ id: number; name: string; code: string }> }>(
          "/admin/leagues/search",
          { method: "GET" }
        )
      ]);
      if (cancelled) return;
      setLoadingLists(false);

      if (!ceremoniesRes.ok || !seasonsRes.ok || !leaguesRes.ok) {
        setStatus({
          ok: false,
          message:
            ceremoniesRes.error ??
            seasonsRes.error ??
            leaguesRes.error ??
            "Failed to load options"
        });
        return;
      }

      setCeremonyOptions(
        (ceremoniesRes.data?.ceremonies ?? []).map((c) => ({
          value: String(c.id),
          label: `${c.name}${c.year ? ` (${c.year})` : ""} · ${c.code}`
        }))
      );
      setSeasonOptions(
        (seasonsRes.data?.seasons ?? []).map((s) => {
          const leagueSlug = slugifyPathSegment(s.league_name);
          const ceremonySlug = ceremonyCodeSlug(s.ceremony_code ?? s.ceremony_name);
          return {
            value: String(s.id),
            label: `${leagueSlug} / ${ceremonySlug}`
          };
        })
      );
      setLeagueOptions(
        (leaguesRes.data?.leagues ?? []).map((l) => ({
          value: String(l.id),
          label: `${l.name} · ${l.code}`
        }))
      );
    }

    void loadAllOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  const open = Boolean(modal);

  const ceremonyId = useMemo(() => Number(ceremonySelectedId), [ceremonySelectedId]);
  const seasonId = useMemo(() => Number(seasonSelectedId), [seasonSelectedId]);
  const leagueId = useMemo(() => Number(leagueSelectedId), [leagueSelectedId]);

  async function loadCeremonyPreview() {
    if (!Number.isFinite(ceremonyId) || ceremonyId <= 0) return;
    setLoadingPreview("ceremony");
    setStatus(null);
    setModalError(null);
    const res = await fetchJson<{
      ceremony: { id: number; name: string };
      consequences: { seasons_removed: number };
    }>(`/admin/ceremonies/${ceremonyId}/delete-preview`, { method: "GET" });
    setLoadingPreview(null);
    if (!res.ok || !res.data?.ceremony || !res.data?.consequences) {
      setStatus({ ok: false, message: res.error ?? "Failed to load preview" });
      return;
    }
    setModal({
      entity: "ceremony",
      id: ceremonyId,
      title: "Delete ceremony?",
      summary: `Deleting "${res.data.ceremony.name}" removes the ceremony and all associated seasons.`,
      consequences: [
        {
          label: "Seasons removed",
          value: Number(res.data.consequences.seasons_removed ?? 0)
        }
      ],
      contextLinks: [
        {
          label: "View ceremony page",
          href: `/admin/ceremonies/${res.data.ceremony.id}`
        }
      ]
    });
  }

  async function loadSeasonPreview() {
    if (!Number.isFinite(seasonId) || seasonId <= 0) return;
    setLoadingPreview("season");
    setStatus(null);
    setModalError(null);
    const res = await fetchJson<{
      season: {
        id: number;
        league_id: number;
        status: string;
        ceremony_name: string | null;
        ceremony_code: string | null;
        league_name: string | null;
      };
      consequences: { seasons_removed: number };
    }>(`/admin/seasons/${seasonId}/delete-preview`, { method: "GET" });
    setLoadingPreview(null);
    if (!res.ok || !res.data?.season || !res.data?.consequences) {
      setStatus({ ok: false, message: res.error ?? "Failed to load preview" });
      return;
    }
    const s = res.data.season;
    setModal({
      entity: "season",
      id: seasonId,
      title: "Delete season?",
      summary: `Deleting this season (${s.league_name ?? "League"} · ${s.ceremony_code ?? s.ceremony_name ?? `Season ${seasonId}`}) is irreversible.`,
      consequences: [{ label: "Seasons removed", value: 1 }],
      contextLinks: [
        {
          label: "View season page",
          href: seasonPath({
            leagueId: s.league_id,
            leagueName: s.league_name ?? "",
            ceremonyCode: s.ceremony_code ?? s.ceremony_name ?? String(s.id)
          })
        }
      ]
    });
  }

  async function loadLeaguePreview() {
    if (!Number.isFinite(leagueId) || leagueId <= 0) return;
    setLoadingPreview("league");
    setStatus(null);
    setModalError(null);
    const res = await fetchJson<{
      league: { id: number; name: string };
      consequences: { seasons_removed: number };
    }>(`/admin/leagues/${leagueId}/delete-preview`, { method: "GET" });
    setLoadingPreview(null);
    if (!res.ok || !res.data?.league || !res.data?.consequences) {
      setStatus({ ok: false, message: res.error ?? "Failed to load preview" });
      return;
    }
    setModal({
      entity: "league",
      id: leagueId,
      title: "Delete league?",
      summary: `Deleting "${res.data.league.name}" removes the league and all contained seasons.`,
      consequences: [
        {
          label: "Seasons removed",
          value: Number(res.data.consequences.seasons_removed ?? 0)
        }
      ],
      contextLinks: [
        {
          label: "View league page",
          href: leaguePath({
            leagueId: res.data.league.id,
            leagueName: res.data.league.name
          })
        }
      ]
    });
  }

  async function confirmDelete() {
    if (!modal) return;
    setLoadingDelete(true);
    setModalError(null);
    const path =
      modal.entity === "ceremony"
        ? `/admin/ceremonies/${modal.id}`
        : modal.entity === "season"
          ? `/admin/seasons/${modal.id}`
          : `/admin/leagues/${modal.id}`;
    const res = await fetchJson(path, { method: "DELETE" });
    setLoadingDelete(false);
    if (!res.ok) {
      setModalError(res.error ?? "Delete failed");
      return;
    }
    notify({
      id: `admin.${modal.entity}.delete.success`,
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: `${modal.entity[0]?.toUpperCase()}${modal.entity.slice(1)} deleted`
    });
    setStatus({ ok: true, message: `${modal.entity} deleted` });
    setModal(null);
  }

  return (
    <Stack component="section" className="stack" gap="md">
      <Title order={3} className="baseline-textSectionHeader">
        Data Deletion
      </Title>

      <StandardCard>
        <Stack gap="xs">
          <Text fw="var(--fo-font-weight-bold)" className="baseline-textBody">
            Delete ceremony
          </Text>
          <Group align="end" wrap="wrap">
            <Select
              label="Ceremony"
              placeholder="Select ceremony..."
              data={ceremonyOptions}
              searchable
              value={ceremonySelectedId}
              onChange={setCeremonySelectedId}
              nothingFoundMessage="No matches"
              disabled={loadingLists}
            />
            <Button
              type="button"
              color="red"
              variant="outline"
              disabled={!ceremonySelectedId || loadingPreview !== null || loadingLists}
              onClick={() => void loadCeremonyPreview()}
            >
              {loadingPreview === "ceremony" ? "Loading..." : "Review delete"}
            </Button>
          </Group>
        </Stack>
      </StandardCard>

      <StandardCard>
        <Stack gap="xs">
          <Text fw="var(--fo-font-weight-bold)" className="baseline-textBody">
            Delete season
          </Text>
          <Group align="end" wrap="wrap">
            <Select
              label="Season"
              placeholder="Select season..."
              data={seasonOptions}
              searchable
              value={seasonSelectedId}
              onChange={setSeasonSelectedId}
              nothingFoundMessage="No matches"
              disabled={loadingLists}
            />
            <Button
              type="button"
              color="red"
              variant="outline"
              disabled={!seasonSelectedId || loadingPreview !== null || loadingLists}
              onClick={() => void loadSeasonPreview()}
            >
              {loadingPreview === "season" ? "Loading..." : "Review delete"}
            </Button>
          </Group>
        </Stack>
      </StandardCard>

      <StandardCard>
        <Stack gap="xs">
          <Text fw="var(--fo-font-weight-bold)" className="baseline-textBody">
            Delete league
          </Text>
          <Group align="end" wrap="wrap">
            <Select
              label="League"
              placeholder="Select league..."
              data={leagueOptions}
              searchable
              value={leagueSelectedId}
              onChange={setLeagueSelectedId}
              nothingFoundMessage="No matches"
              disabled={loadingLists}
            />
            <Button
              type="button"
              color="red"
              variant="outline"
              disabled={!leagueSelectedId || loadingPreview !== null || loadingLists}
              onClick={() => void loadLeaguePreview()}
            >
              {loadingPreview === "league" ? "Loading..." : "Review delete"}
            </Button>
          </Group>
        </Stack>
      </StandardCard>

      {status ? (
        <Alert color={status.ok ? "green" : "red"}>{status.message}</Alert>
      ) : null}

      <DestructiveActionModal
        opened={open}
        onClose={() => {
          if (loadingDelete) return;
          setModal(null);
          setModalError(null);
        }}
        title={modal?.title ?? "Delete"}
        summary={modal?.summary ?? ""}
        consequences={modal?.consequences ?? []}
        confirmPhrase="DELETE"
        confirmLabel="Delete"
        contextLinks={modal?.contextLinks}
        loading={loadingDelete}
        error={modalError}
        onConfirm={() => void confirmDelete()}
      />
    </Stack>
  );
}
