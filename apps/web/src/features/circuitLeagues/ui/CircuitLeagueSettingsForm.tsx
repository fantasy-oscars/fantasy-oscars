import type { ReactNode } from "react";
import {
  Box,
  Button,
  Divider,
  Group,
  NumberInput,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title
} from "@ui";
import { CIRCUIT_LEAGUE_LIMITS as LIMITS } from "@fantasy-oscars/shared/schemas";
import { FormStatus } from "@/shared/forms";
import { StandardCard } from "@/primitives";
import {
  circuitLeagueCategoryValue,
  circuitLeagueEventDescription,
  circuitLeagueEventValue,
  onOffLabel,
  pickClockLabel,
  type CircuitLeagueForm
} from "@/decisions/circuitLeague";
import type {
  ApiResult,
  CircuitLeagueCategory,
  CircuitLeagueEvent,
  CircuitLeagueSettings
} from "@/lib/types";
import classes from "./CircuitLeagueSettingsForm.module.css";

type Update = (patch: (prev: CircuitLeagueForm) => CircuitLeagueForm) => void;

/** An editable section is a fieldset with a legend; a read-only one is a plain section. */
function Section(props: { title: string; editing: boolean; children: ReactNode }) {
  const { title, editing, children } = props;
  return editing ? (
    <Stack gap="sm" component="fieldset" className={classes.fieldset}>
      <Title component="legend" order={3} variant="section">
        {title}
      </Title>
      {children}
    </Stack>
  ) : (
    <Stack gap="sm" component="section">
      <Title order={3} variant="section">
        {title}
      </Title>
      {children}
    </Stack>
  );
}

type ReadOnlyRow = {
  key: string | number;
  label: string;
  detail?: string | null;
  value: string;
};

/** Saved values as text: label (and an optional detail line) beside the value. */
function ReadOnlyRows(props: { rows: ReadOnlyRow[] }) {
  return (
    <Box component="dl" className={classes.readList}>
      {props.rows.map((r) => (
        <div key={r.key} className={classes.readRow}>
          <Box component="dt" miw="var(--fo-space-0)">
            <Text className="baseline-textBody baseline-wrapAnywhere">{r.label}</Text>
            {r.detail ? <Text variant="meta">{r.detail}</Text> : null}
          </Box>
          <Text component="dd" className={`baseline-textBody ${classes.readValue}`}>
            {r.value}
          </Text>
        </div>
      ))}
    </Box>
  );
}

export function CircuitLeagueSettingsForm(props: {
  form: CircuitLeagueForm;
  /** The saved settings, shown as text where the viewer cannot edit. */
  settings: CircuitLeagueSettings;
  events: CircuitLeagueEvent[];
  categories: CircuitLeagueCategory[];
  /** Commissioners edit what is still open; everyone else reads the saved values. */
  canManage: boolean;
  editable: { all: boolean; draftClock: boolean };
  dirty: boolean;
  saving: boolean;
  status: ApiResult | null;
  onChange: Update;
  onSave: () => void;
  onReset: () => void;
}) {
  const {
    form,
    settings,
    events,
    categories,
    canManage,
    editable,
    dirty,
    saving,
    status,
    onChange
  } = props;
  const editAll = canManage && editable.all;
  const editClock = canManage && editable.draftClock;
  const set = <K extends keyof CircuitLeagueForm>(key: K, value: CircuitLeagueForm[K]) =>
    onChange((prev) => ({ ...prev, [key]: value }));
  const setEvent = (id: number, patch: Partial<CircuitLeagueForm["events"][number]>) =>
    onChange((prev) => ({
      ...prev,
      events: { ...prev.events, [id]: { ...prev.events[id]!, ...patch } }
    }));
  const setCategory = (
    id: number,
    patch: Partial<CircuitLeagueForm["categories"][number]>
  ) =>
    onChange((prev) => ({
      ...prev,
      categories: { ...prev.categories, [id]: { ...prev.categories[id]!, ...patch } }
    }));

  const cardProps = editClock
    ? {
        component: "form",
        onSubmit: (e: React.FormEvent) => {
          e.preventDefault();
          props.onSave();
        }
      }
    : { component: "section" };

  return (
    <StandardCard {...cardProps} aria-label="Season settings">
      <Stack gap="md">
        {canManage && !editable.all ? (
          <Text variant="helper">
            {editable.draftClock
              ? "Events, roster and scoring are locked. The pick clock and auto-draft can change until the draft starts."
              : "Settings are locked."}
          </Text>
        ) : null}

        <Section title="Roster and scoring" editing={editAll}>
          {editAll ? (
            <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="sm">
              <NumberInput
                hideControls
                label="Roster size"
                value={form.rosterSize}
                onChange={(v) => set("rosterSize", v)}
                min={LIMITS.rosterSize.min}
                max={LIMITS.rosterSize.max}
                allowDecimal={false}
                disabled={saving}
              />
              <NumberInput
                hideControls
                label="Points per nomination"
                value={form.nominationPoints}
                onChange={(v) => set("nominationPoints", v)}
                min={LIMITS.points.min}
                max={LIMITS.points.max}
                allowDecimal={false}
                disabled={saving}
              />
              <NumberInput
                hideControls
                label="Points per win"
                value={form.winBonusPoints}
                onChange={(v) => set("winBonusPoints", v)}
                min={LIMITS.points.min}
                max={LIMITS.points.max}
                allowDecimal={false}
                disabled={saving}
              />
            </SimpleGrid>
          ) : (
            <ReadOnlyRows
              rows={[
                {
                  key: "roster",
                  label: "Roster size",
                  value: String(settings.roster_size)
                },
                {
                  key: "nomination",
                  label: "Points per nomination",
                  value: String(settings.nomination_points)
                },
                {
                  key: "win",
                  label: "Points per win",
                  value: String(settings.win_bonus_points)
                }
              ]}
            />
          )}
        </Section>

        <Divider />

        <Section title="Draft" editing={editClock}>
          {editClock ? (
            <>
              <Text variant="helper">Snake draft.</Text>
              <Stack gap="xs">
                <Switch
                  label="Pick timer"
                  checked={form.timerEnabled}
                  onChange={(e) => set("timerEnabled", e.currentTarget.checked)}
                  disabled={saving}
                />
                <NumberInput
                  hideControls
                  label="Seconds per pick"
                  value={form.pickTimerSeconds}
                  onChange={(v) => set("pickTimerSeconds", v)}
                  min={1}
                  max={LIMITS.pickTimerSeconds.max}
                  step={5}
                  allowDecimal={false}
                  disabled={saving || !form.timerEnabled}
                  maw="var(--fo-layout-fieldBasis-sm)"
                />
              </Stack>
              <Switch
                label="Auto-draft"
                description="When a player’s clock runs out, pick the next contender from their queue."
                checked={form.autoDraftEnabled}
                onChange={(e) => set("autoDraftEnabled", e.currentTarget.checked)}
                disabled={saving}
              />
            </>
          ) : (
            <ReadOnlyRows
              rows={[
                { key: "type", label: "Draft", value: "Snake" },
                {
                  key: "clock",
                  label: "Pick timer",
                  value: pickClockLabel(settings.pick_timer_seconds)
                },
                {
                  key: "auto",
                  label: "Auto-draft",
                  detail: "Picks from a player’s queue when their clock runs out",
                  value: onOffLabel(settings.auto_draft_enabled)
                }
              ]}
            />
          )}
        </Section>

        <Divider />

        <Section title="Events" editing={editAll}>
          <Text variant="helper">
            Only enabled events score. A weight multiplies every point the event awards.
          </Text>
          {events.length === 0 ? (
            <Text className="baseline-textBody">No events yet.</Text>
          ) : editAll ? (
            <Stack component="ul" gap="var(--fo-space-0)" className="fo-listReset">
              {events.map((e, idx) => {
                const f = form.events[e.id]!;
                return (
                  <Box key={e.id} component="li">
                    <Group justify="space-between" align="center" wrap="wrap" py="sm">
                      <Switch
                        label={e.name}
                        description={circuitLeagueEventDescription(e)}
                        checked={f.enabled}
                        onChange={(ev) =>
                          setEvent(e.id, { enabled: ev.currentTarget.checked })
                        }
                        disabled={saving}
                      />
                      <NumberInput
                        hideControls
                        label="Weight"
                        aria-label={`${e.name} weight`}
                        value={f.weight}
                        onChange={(v) => setEvent(e.id, { weight: v })}
                        min={0}
                        max={LIMITS.weight.max}
                        step={0.5}
                        disabled={saving || !f.enabled}
                        className={classes.numberCell}
                      />
                    </Group>
                    {idx === events.length - 1 ? null : <Divider />}
                  </Box>
                );
              })}
            </Stack>
          ) : (
            <ReadOnlyRows
              rows={events.map((e) => ({
                key: e.id,
                label: e.name,
                detail: circuitLeagueEventDescription(e),
                value: circuitLeagueEventValue(e)
              }))}
            />
          )}
        </Section>

        <Divider />

        <Section title="Categories" editing={editAll}>
          <Text variant="helper">
            {editAll
              ? "A weight multiplies the category’s points. A limit caps how many contenders one player may own in it; leave it empty for no limit."
              : "A weight multiplies the category’s points. A limit caps how many contenders one player may own in it."}
          </Text>
          {categories.length === 0 ? (
            <Text className="baseline-textBody">No categories yet.</Text>
          ) : editAll ? (
            <Stack component="ul" gap="var(--fo-space-0)" className="fo-listReset">
              {categories.map((c, idx) => {
                const f = form.categories[c.id]!;
                return (
                  <Box key={c.id} component="li">
                    <Group justify="space-between" align="flex-end" wrap="wrap" py="sm">
                      <Text className="baseline-textBody baseline-wrapAnywhere">
                        {c.name}
                      </Text>
                      <Group gap="sm" wrap="nowrap">
                        <NumberInput
                          hideControls
                          label="Weight"
                          aria-label={`${c.name} weight`}
                          value={f.weight}
                          onChange={(v) => setCategory(c.id, { weight: v })}
                          min={0}
                          max={LIMITS.weight.max}
                          step={0.5}
                          disabled={saving}
                          className={classes.numberCell}
                        />
                        <NumberInput
                          hideControls
                          label="Limit"
                          aria-label={`${c.name} limit`}
                          placeholder="None"
                          value={f.maxOwned}
                          onChange={(v) => setCategory(c.id, { maxOwned: v })}
                          min={LIMITS.maxOwned.min}
                          max={LIMITS.maxOwned.max}
                          allowDecimal={false}
                          disabled={saving}
                          className={classes.numberCell}
                        />
                      </Group>
                    </Group>
                    {idx === categories.length - 1 ? null : <Divider />}
                  </Box>
                );
              })}
            </Stack>
          ) : (
            <ReadOnlyRows
              rows={categories.map((c) => ({
                key: c.id,
                label: c.name,
                value: circuitLeagueCategoryValue(c)
              }))}
            />
          )}
        </Section>

        {editClock ? (
          <Group wrap="wrap" justify="flex-start">
            <Button type="submit" disabled={!dirty || saving}>
              {saving ? "Saving..." : "Save settings"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={props.onReset}
              disabled={!dirty || saving}
            >
              Reset
            </Button>
          </Group>
        ) : null}
        <FormStatus loading={false} result={status} />
      </Stack>
    </StandardCard>
  );
}
