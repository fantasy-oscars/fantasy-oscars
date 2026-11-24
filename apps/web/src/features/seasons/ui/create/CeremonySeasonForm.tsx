import { Button, Group, NumberInput, Select, Stack, Switch, Text } from "@ui";
import type { LeagueSeasonCreateView } from "@/orchestration/seasons";
import { FormStatus } from "@/shared/forms";
import { StandardCard } from "@/primitives";
import { comingSoonSetupNote, goLiveOptionLabel, isComingSoon } from "@/decisions/goLive";

type ReadyView = Extract<LeagueSeasonCreateView, { state: "ready" }>;

/** Card 2 of Create season for a single ceremony. */
export function CeremonySeasonForm(props: {
  view: ReadyView;
  actions: {
    setCeremonyId: (v: number | null) => void;
    setScoringStrategy: (v: "fixed" | "negative" | "category_weighted") => void;
    setRemainderStrategy: (v: "UNDRAFTED" | "FULL_POOL") => void;
    setTimerEnabled: (v: boolean) => void;
    setPickTimerSeconds: (v: number) => void;
    reset: () => void;
    submit: () => void;
  };
}) {
  const { view, actions } = props;
  const chosen = view.ceremonies.find((c) => c.id === view.ceremonyId) ?? null;
  return (
    <StandardCard
      component="form"
      aria-label="Single ceremony season"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        if (view.canSubmit) actions.submit();
      }}
    >
      <Stack gap="sm">
        <Select
          label="Ceremony"
          error={view.fieldErrors.ceremony_id}
          placeholder="Select ceremony…"
          value={view.ceremonyId ? String(view.ceremonyId) : null}
          onChange={(v) => actions.setCeremonyId(v ? Number(v) : null)}
          disabled={view.working}
          data={view.ceremonies.map((c) => ({
            value: String(c.id),
            label: goLiveOptionLabel(c)
          }))}
        />
        {chosen && isComingSoon(chosen.status) ? (
          <Text variant="helper">{comingSoonSetupNote("ceremony")}</Text>
        ) : null}
        {view.ceremonies.length === 0 && (
          <Text className="baseline-textMeta">
            No ceremonies are open for leagues yet.
          </Text>
        )}

        <Select
          label="Scoring strategy"
          error={view.fieldErrors.scoring_strategy_name}
          value={view.scoringStrategy}
          onChange={(v) =>
            actions.setScoringStrategy(
              (v ?? "fixed") as "fixed" | "negative" | "category_weighted"
            )
          }
          disabled={view.working}
          data={[
            { value: "fixed", label: "Standard" },
            { value: "negative", label: "Negative" },
            { value: "category_weighted", label: "Category-weighted" }
          ]}
        />

        <Select
          label="Leftover picks"
          error={view.fieldErrors.remainder_strategy}
          value={view.remainderStrategy}
          onChange={(v) =>
            actions.setRemainderStrategy((v ?? "UNDRAFTED") as "UNDRAFTED" | "FULL_POOL")
          }
          disabled={view.working}
          data={[
            { value: "UNDRAFTED", label: "Leave extras undrafted" },
            { value: "FULL_POOL", label: "Use full pool (extras drafted)" }
          ]}
        />

        <Stack gap="xs" align="flex-start">
          <Switch
            label="Pick timer"
            checked={view.timerEnabled}
            onChange={(e) => actions.setTimerEnabled(e.currentTarget.checked)}
            disabled={view.working}
          />
          <NumberInput
            label="Seconds per pick"
            maw="var(--fo-layout-fieldBasis-sm)"
            w="100%"
            error={view.fieldErrors.pick_timer_seconds}
            value={view.pickTimerSeconds}
            onChange={(v) => actions.setPickTimerSeconds(Number(v) || 0)}
            min={0}
            step={5}
            clampBehavior="strict"
            disabled={view.working || !view.timerEnabled}
          />
        </Stack>

        <Group wrap="wrap" justify="flex-start">
          <Button type="submit" disabled={!view.canSubmit} variant="primary">
            {view.working ? "Creating..." : "Create season"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={actions.reset}
            disabled={view.working}
          >
            Reset
          </Button>
        </Group>

        <FormStatus loading={view.working} result={view.status} />
      </Stack>
    </StandardCard>
  );
}
