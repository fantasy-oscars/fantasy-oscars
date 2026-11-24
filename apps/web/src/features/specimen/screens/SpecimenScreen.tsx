import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Checkbox,
  Group,
  Menu,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Tooltip
} from "@ui";
import { Markdown } from "@ui/Markdown";
import { Notification } from "@ui/Notification";
import { BRAND_CATALOG, BRAND_IDS, DARK_MODE } from "@fantasy-oscars/shared/brands";
import { AppearanceSection } from "@/features/account/ui/AppearanceSection";
import { deriveAppearanceView, type AppearanceState } from "@/decisions/appearance";
import { ShellHeader } from "@/app/chrome/ui/ShellHeader";
import { ShellPrimaryNav } from "@/app/chrome/ui/ShellPrimaryNav";
import { Wordmark } from "@/app/chrome/ui/Wordmark";
import { NomineeTooltipCard } from "@/shared/nominee/NomineeTooltipCard";
import { CategoryCard } from "@/features/draft/ui/CategoryCard";
import { DraftHeaderTab } from "@/features/draft/ui/DraftHeaderTab";
import { computeHeaderStatus } from "@/decisions/draft/headerStatus";
import type { PodiumCell } from "@/decisions/draft/podium";
import { windowForSeat } from "@/decisions/draft/rosterWindow";
import { useRosterRotation } from "@/orchestration/draft/useRosterRotation";
import { RosterTrack } from "@/features/draft/ui/RosterTrack";
import { AvatarToken } from "@/features/draft/ui/AvatarToken";
import { DraftMasonryBoard } from "@/features/draft/ui/DraftMasonryBoard";
import { ActionCard, EmptyState, HeroCard, StandardCard } from "@/primitives";
import { statusTone } from "@/decisions/statusTone";
import { PageError } from "@/shared/page-state";
import { StatusPill, WinnerChip } from "@/shared/pills";
import { BannerStackScreen } from "@/app/chrome/screens/BannerStackScreen";
import { LeagueSeasonsSection } from "@/features/leagues/ui/LeagueSeasonsSection";
import "@/primitives/baseline.css";
import "../specimen.css";
import {
  BANNERS,
  BOARD_COLUMNS,
  DISABLED_CARD_TITLE,
  DISABLED_PILLS,
  EDGE_COLUMNS,
  FILM_TITLES,
  FORCED_PILLS,
  HOVER_MATCH_IDS,
  LONG_FILM_TITLE,
  MARKDOWN_SAMPLE_TREE,
  NAV_LINKS,
  PILL_CARD_TITLE,
  PILL_STATES,
  PUNCHOUT_PILLS,
  PUNCHOUT_STATES_TITLE,
  ICON_AUDIT_PILLS,
  ICON_DEFAULT_TITLE,
  ICON_PUNCHOUT_TITLE,
  SEASONS,
  SELECT_OPTIONS,
  SPECIMEN_MARKER,
  SPECIMEN_USER,
  SPECIMEN_USER_SHORT,
  STATUS_LABELS
} from "../fixtures";
import { forceStates, installForcedStateRules, type ForcedState } from "../forceStates";
import { applySpecimenHooks, CELL_HOOK_ATTR, CELL_STATE_ATTR } from "../hooks";

const noop = () => {};
const noopAsync = async () => {};

/** A labelled sample; `force` holds the interaction states to render on its control. */
function Cell(props: {
  label: string;
  force?: readonly ForcedState[];
  /** Measurement hook (`component[:variant]`) and state of the cell's one measured element; see hooks.ts. */
  hook?: string;
  state?: string;
  /** Span every column of the grid (a sample wider than one column). */
  span?: boolean;
  children: ReactNode;
}) {
  return (
    <Box
      className="specimen-cell"
      data-specimen-cell=""
      data-force={props.force?.join(" ")}
      {...{ [CELL_HOOK_ATTR]: props.hook, [CELL_STATE_ATTR]: props.state }}
      data-span={props.span ? "full" : undefined}
    >
      <Text component="span" className="specimen-label">
        {props.label}
      </Text>
      {props.children}
    </Box>
  );
}

function Section(props: { title: string; wide?: boolean; children: ReactNode }) {
  return (
    <Box component="section" className="specimen-section" aria-label={props.title}>
      <Title variant="section">{props.title}</Title>
      <Box className={["specimen-grid", props.wide ? "is-wide" : ""].join(" ")}>
        {props.children}
      </Box>
    </Box>
  );
}

/**
 * The sample card the screenshot tier captures per brand and mode: a heading, body text,
 * a status chip, both button kinds and an input, in real components with fixed data.
 * `data-specimen-sample` is the capture hook; it carries no measurement hook.
 */
function SampleCard() {
  const { tone, mark } = statusTone("In progress");
  return (
    <Box className="specimen-sample" data-specimen-sample="">
      <StandardCard>
        <Stack gap="sm">
          <Group justify="space-between" align="center" wrap="nowrap">
            <Title variant="card">Friday Night Film Club</Title>
            <StatusPill tone={tone} mark={mark}>
              In progress
            </StatusPill>
          </Group>
          <Text>Draft the nominees with friends and win on ceremony night.</Text>
          <TextInput label="League name" defaultValue="Friday Night Film Club" />
          <Group>
            <Button variant="primary">Save</Button>
            <Button variant="secondary">Cancel</Button>
          </Group>
        </Stack>
      </StandardCard>
    </Box>
  );
}

/** The real site header, fed static props: no auth, no network. */
function StaticHeader(props: {
  user: typeof SPECIMEN_USER | null;
  navMode: "inline" | "drawer";
  menuOpen?: boolean;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  return (
    <ShellHeader
      navMode={props.navMode}
      rowRef={rowRef}
      navDrawerOpen={false}
      onOpenNavDrawer={noop}
      user={props.user}
      loading={false}
      logout={noopAsync}
      inviteCount={props.user ? 3 : 0}
      userMenuOpen={props.menuOpen ?? false}
      setUserMenuOpen={noop}
    />
  );
}

const APPEARANCE_DEFAULTS: AppearanceState["settings"] = {
  fixed: null,
  mode: "theme",
  excluded: [],
  undiscoveredEnabled: true,
  singleModePolicy: "own"
};

/** The released-theme list the specimen shows: every brand, as in a test build. */
function appearanceView(
  state: Partial<Omit<AppearanceState, "settings">> & {
    settings?: Partial<AppearanceState["settings"]>;
  },
  context: Parameters<typeof deriveAppearanceView>[1] = {}
) {
  return deriveAppearanceView(
    {
      discovered: [],
      draw: null,
      fixedUnavailable: false,
      ...state,
      settings: { ...APPEARANCE_DEFAULTS, ...state.settings }
    },
    { enabled: BRAND_IDS, ...context }
  );
}

const THREE_DISCOVERED = ["ballot", "noir", "festival"] as const;

/** Noir offered in one mode only: the one case that shows the single-mode control. */
const ONE_MODE_NOIR = BRAND_CATALOG.map((entry) =>
  entry.id === "noir" ? { ...entry, modes: [DARK_MODE] as const } : entry
);

function AppearanceMatrix(props: { vertical: boolean }) {
  const { vertical } = props;
  const base = { vertical, onRetry: noop, statusText: "" };
  const handlers = {
    onModeChange: noop,
    onSelectionChange: noop,
    onFixedChange: noop,
    onRandomChange: noop,
    onPolicyChange: noop
  };
  const cells: Array<{
    label: string;
    id: string;
    view: ReturnType<typeof appearanceView>;
    statusText?: string;
    failure?: boolean;
    listOpen?: boolean;
  }> = [
    {
      label: "random, default",
      id: "random",
      view: appearanceView({ discovered: [...THREE_DISCOVERED] }),
      statusText: "Saved"
    },
    {
      label: "fixed",
      id: "fixed",
      view: appearanceView({
        discovered: [...THREE_DISCOVERED],
        settings: { fixed: "ballot" }
      })
    },
    {
      label: "one option selected",
      id: "floor",
      view: appearanceView({ settings: { undiscoveredEnabled: false } })
    },
    {
      label: "single-mode control",
      id: "conflict",
      view: appearanceView(
        { discovered: [...THREE_DISCOVERED], settings: { mode: "dark" } },
        { catalog: ONE_MODE_NOIR }
      )
    },
    {
      label: "save failed",
      id: "failure",
      view: appearanceView({}),
      failure: true
    },
    { label: "one theme discovered", id: "one", view: appearanceView({}) },
    {
      label: "all themes discovered",
      id: "all",
      view: appearanceView({ discovered: [...BRAND_IDS] })
    },
    {
      label: "random list open",
      id: "open",
      view: appearanceView({ discovered: [...BRAND_IDS] }),
      listOpen: true
    }
  ];
  return (
    <>
      {cells.map((cell) => (
        <Cell
          key={cell.id}
          label={cell.label}
          // The first cell holds the real segmented controls; its first one is shown focused.
          hook={cell.id === "random" ? "segmented" : undefined}
          force={cell.id === "random" ? ["focus"] : undefined}
        >
          <Box className={cell.listOpen ? "specimen-listOpen" : undefined}>
            <AppearanceSection
              {...base}
              {...handlers}
              idPrefix={`specimen-appearance-${cell.id}`}
              view={cell.view}
              statusText={cell.statusText ?? ""}
              failure={cell.failure ?? false}
              listOpen={cell.listOpen}
            />
          </Box>
        </Cell>
      ))}
    </>
  );
}

function ButtonMatrix() {
  const variants = ["primary", "secondary", "ghost", "danger"] as const;
  const states: Array<{ name: string; force?: ForcedState[]; disabled?: boolean }> = [
    { name: "default" },
    { name: "hover", force: ["hover"] },
    { name: "focus", force: ["focus"] },
    { name: "active", force: ["active"] },
    { name: "disabled", disabled: true }
  ];
  return (
    <>
      {variants.flatMap((variant) =>
        states.map((s) => (
          <Cell
            key={`${variant}-${s.name}`}
            label={`${variant}, ${s.name}`}
            force={s.force}
            hook={`button:${variant}`}
            state={s.name}
          >
            <Button variant={variant} disabled={s.disabled}>
              {variant === "danger" ? "Delete league" : "Save changes"}
            </Button>
          </Cell>
        ))
      )}
      {states.map((s) => (
        <Cell
          key={`icon-${s.name}`}
          label={`icon, ${s.name}`}
          force={s.force}
          hook="icon-button"
          state={s.name}
        >
          <ActionIcon aria-label="Open navigation" disabled={s.disabled}>
            <Text component="span" className="mi-icon" aria-hidden="true">
              menu
            </Text>
          </ActionIcon>
        </Cell>
      ))}
    </>
  );
}

function FormMatrix() {
  const states: Array<{
    name: string;
    force?: ForcedState[];
    error?: string;
    disabled?: boolean;
  }> = [
    { name: "default" },
    { name: "focus", force: ["focus"] },
    { name: "error", error: "This field is required" },
    { name: "disabled", disabled: true }
  ];
  const checkStates = [{ name: "selected" }, ...states];
  return (
    <>
      {states.map((s) => (
        <Cell
          key={`text-${s.name}`}
          label={`input, ${s.name}`}
          force={s.force}
          hook="input"
          state={s.name}
        >
          <TextInput
            label="League name"
            defaultValue={s.disabled ? "Friday Night Film Club" : undefined}
            placeholder="Friday Night Film Club"
            error={s.error}
            disabled={s.disabled}
          />
        </Cell>
      ))}
      {states.map((s) => (
        <Cell
          key={`select-${s.name}`}
          label={`select, ${s.name}`}
          force={s.force}
          hook="select"
          state={s.name}
        >
          <Select
            label="Category"
            data={SELECT_OPTIONS}
            defaultValue="Best Picture"
            error={s.error}
            disabled={s.disabled}
          />
        </Cell>
      ))}
      {states.map((s) => (
        <Cell
          key={`number-${s.name}`}
          label={`number input, ${s.name}`}
          force={s.force}
          hook="number-input"
          state={s.name}
        >
          <NumberInput
            label="Pick timer (seconds)"
            defaultValue={90}
            error={s.error}
            disabled={s.disabled}
          />
        </Cell>
      ))}
      {checkStates.map((s) => (
        <Cell
          key={`check-${s.name}`}
          label={`checkbox, ${s.name}`}
          force={s.force}
          hook="checkbox"
          state={s.name}
        >
          <Checkbox
            label="Allow auto-draft"
            defaultChecked={s.name === "selected"}
            error={s.error}
            disabled={s.disabled}
          />
        </Cell>
      ))}
    </>
  );
}

/** The switch in the states its skin changes (the segmented control is measured in the appearance cells). */
function SelectionMatrix() {
  const switches: Array<{
    name: string;
    force?: ForcedState[];
    checked?: boolean;
    disabled?: boolean;
  }> = [
    { name: "default" },
    { name: "selected", checked: true },
    { name: "focus", force: ["focus"] },
    { name: "disabled", disabled: true }
  ];
  return (
    <>
      {switches.map((s) => (
        <Cell
          key={`switch-${s.name}`}
          label={`switch, ${s.name}`}
          force={s.force}
          hook="switch"
          state={s.name}
        >
          <Switch label="Auto-draft" defaultChecked={s.checked} disabled={s.disabled} />
        </Cell>
      ))}
    </>
  );
}

/** One category card as the room renders it, from specimen nominees. */
function specimenCard(
  props: Pick<
    React.ComponentProps<typeof CategoryCard>,
    "title" | "nominees" | "canDraftAction" | "categoryId"
  > &
    Partial<Pick<React.ComponentProps<typeof CategoryCard>, "iconVariant">>
) {
  return (
    <CategoryCard
      iconVariant="default"
      {...props}
      icon="trophy"
      unitKind="FILM"
      tooltipsEnabled={false}
      weightText={null}
      hoveredNominationIds={HOVER_MATCH_IDS}
      isKeyboardMode={false}
      setKeyboardMode={noop}
      onNomineeClick={noop}
      onNomineeDoubleClick={noop}
    />
  );
}

function PillBoard() {
  const p = PILL_STATES;
  return (
    <Box className="dr-frame" data-turn="mine" data-results="live">
      <Box className="specimen-grid is-wide">
        {specimenCard({
          categoryId: "pill-states",
          title: PILL_CARD_TITLE,
          canDraftAction: true,
          nominees: [
            p.default,
            p.hoverMatch,
            p.hoverPointer,
            p.armed,
            p.won,
            p.wonHover,
            p.wonArmed,
            p.focus,
            p.long
          ]
        })}
        {specimenCard({
          categoryId: "pill-disabled",
          title: DISABLED_CARD_TITLE,
          canDraftAction: false,
          nominees: DISABLED_PILLS
        })}
      </Box>
    </Box>
  );
}

/** The draft room's icon rules on one row: every pill state with the punchout variant, and the audit cards. */
function DraftIconRow() {
  return (
    <Box className="dr-frame" data-turn="mine" data-results="live">
      <Box className="specimen-grid is-wide">
        {specimenCard({
          categoryId: "punchout-states",
          title: PUNCHOUT_STATES_TITLE,
          canDraftAction: true,
          iconVariant: "inverted",
          nominees: PUNCHOUT_PILLS
        })}
        {specimenCard({
          categoryId: "icon-punchout",
          title: ICON_PUNCHOUT_TITLE,
          canDraftAction: true,
          iconVariant: "inverted",
          nominees: ICON_AUDIT_PILLS
        })}
        {specimenCard({
          categoryId: "icon-default",
          title: ICON_DEFAULT_TITLE,
          canDraftAction: true,
          nominees: ICON_AUDIT_PILLS
        })}
      </Box>
    </Box>
  );
}

type StripState = Partial<Parameters<typeof computeHeaderStatus>[0]>;

/** The room's header row around one tab state, fed fixed values: nothing here ticks. */
function DraftHeaderStrip(props: {
  label: string;
  state: StripState;
  round?: number | null;
  pick?: number | null;
  podium?: PodiumCell[];
  phone: boolean;
}) {
  const status = computeHeaderStatus({
    draftStatus: "IN_PROGRESS",
    isFinalResults: false,
    hasPodium: (props.podium?.length ?? 0) > 0,
    isTimerDraft: false,
    isMyTurn: false,
    countdownActive: false,
    countdownPhase: null,
    timerRemainingMs: null,
    clockText: "1:30",
    activeLabel: "blake",
    ...props.state
  });
  const tab = (
    <DraftHeaderTab
      status={status}
      roundNumber={props.round === undefined ? 3 : props.round}
      pickNumber={props.pick === undefined ? 14 : props.pick}
      podium={props.podium ?? []}
    />
  );
  return (
    <Cell label={props.label} span>
      <Box className="specimen-headerCell is-strip">
        <Box className="dr-frame" data-turn="mine" data-results="live">
          {props.phone ? (
            <Box className="dr-header dr-mobileHeader">
              <Box className="dr-mobileBar">
                <ActionIcon
                  variant="subtle"
                  aria-label="Menu"
                  className="dr-mobileIconBtn"
                  onClick={noop}
                >
                  <Text component="span" className="mi-icon" aria-hidden="true">
                    menu
                  </Text>
                </ActionIcon>
                {tab}
                <ActionIcon
                  variant="subtle"
                  aria-label="Settings"
                  className="dr-mobileIconBtn"
                  onClick={noop}
                >
                  <Text component="span" className="mi-icon" aria-hidden="true">
                    settings
                  </Text>
                </ActionIcon>
              </Box>
            </Box>
          ) : (
            <Box className="dr-header">
              <Box className="drh-row">
                {/* One token in the left wing, as the room shows with a short roster. */}
                <AvatarToken label="avery" avatarKey="giraffe" active />
                {tab}
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Cell>
  );
}

const COUNTDOWN: StripState = {
  isTimerDraft: true,
  isMyTurn: true,
  countdownActive: true,
  activeLabel: "avery"
};

/** Ties on every place, one long name: the static podium (the cycle holds still). */
const SPECIMEN_PODIUM: PodiumCell[] = [
  { place: 1, names: ["avery", "blake"] },
  { place: 2, names: [LONG_FILM_TITLE, "jo"] },
  { place: 3, names: ["morgan"] }
];

const ROSTER_SEATS = 12;

/** One roster board held at its first or last position, so the end control reads disabled. */
function RosterEnd(props: { end: "start" | "end" }) {
  const rotation = useRosterRotation({ count: ROSTER_SEATS, layout: "desktop" });
  const { capacity } = rotation.geometry;
  const start =
    props.end === "start" ? 0 : windowForSeat(ROSTER_SEATS - 1, capacity, ROSTER_SEATS);
  const held = {
    ...rotation,
    start,
    canPrev: start > 0,
    canNext: start + capacity < ROSTER_SEATS,
    instant: true
  };
  return (
    <Box className="dr-frame" data-turn="mine" data-results="live">
      <RosterTrack
        rotation={held}
        columnKey={(i) => i}
        renderColumn={(i) => (
          <Box className="dr-card dr-rosterCard">
            <Text>{`Seat ${i + 1}`}</Text>
          </Box>
        )}
      />
    </Box>
  );
}

/**
 * Category names the drafted-by chip must not cover: the longest official name (the repo's
 * own data carries only short ones) and a stress length with one unbreakable word.
 */
const TOOLTIP_CATEGORIES = [
  {
    label: "longest real name",
    name: "Best International Feature Film",
    drafter: "avery"
  },
  {
    label: "long drafter name",
    name: "Best Cinematography",
    drafter: "avery_the_long_drafter"
  },
  {
    label: "stress length",
    drafter: "avery",
    name: "Best Achievement in Cinematography and Production Design for a Feature-Length Motion Picture Supercalifragilistic"
  }
] as const;

function DraftSlice(props: { phone: boolean }) {
  const { phone } = props;
  return (
    <Box className="specimen-section">
      <Title variant="section">Draft board</Title>
      <Box className="specimen-grid is-wide">
        <DraftHeaderStrip
          phone={phone}
          label="rest, not started"
          state={{ draftStatus: "PENDING" }}
          round={null}
          pick={null}
        />
        <DraftHeaderStrip phone={phone} label="rest, on the clock" state={{}} />
        <DraftHeaderStrip
          phone={phone}
          label="rest, timed (seat name)"
          state={{ isTimerDraft: true }}
        />
        <DraftHeaderStrip
          phone={phone}
          label="mine"
          state={{ isMyTurn: true, activeLabel: "avery" }}
        />
        <DraftHeaderStrip
          phone={phone}
          label="mine, timed"
          state={{ isTimerDraft: true, isMyTurn: true, activeLabel: "avery" }}
        />
        <DraftHeaderStrip
          phone={phone}
          label="paused"
          state={{ draftStatus: "PAUSED" }}
        />
        <DraftHeaderStrip
          phone={phone}
          label="countdown, primary"
          state={{ ...COUNTDOWN, countdownPhase: "gold", timerRemainingMs: 4000 }}
        />
        <DraftHeaderStrip
          phone={phone}
          label="countdown, danger"
          state={{ ...COUNTDOWN, countdownPhase: "red", timerRemainingMs: 3000 }}
        />
        <DraftHeaderStrip
          phone={phone}
          label="final, podium with ties"
          state={{ isFinalResults: true }}
          podium={SPECIMEN_PODIUM}
        />
        <DraftHeaderStrip
          phone={phone}
          label="complete, no podium"
          state={{ isFinalResults: true }}
        />
        {TOOLTIP_CATEGORIES.map((c) => (
          <Cell key={c.label} label={`nominee tooltip, ${c.label}`}>
            <Box className="specimen-tip" data-specimen-tip={c.label}>
              <NomineeTooltipCard
                unitKind="FILM"
                categoryName={c.name}
                filmTitle={LONG_FILM_TITLE}
                filmYear={2024}
                contributors={["Ana Ferreira", "Tomas Reyes"]}
                draftedByLabel={c.drafter}
                draftedByAvatarKey={null}
                draftedRoundPick="R3 #4"
              />
            </Box>
          </Cell>
        ))}
        <Cell label="roster controls, start end">
          <RosterEnd end="start" />
        </Cell>
        <Cell label="roster controls, last end">
          <RosterEnd end="end" />
        </Cell>
      </Box>
      <Box className="dr-frame specimen-board" data-turn="mine" data-results="live">
        <DraftMasonryBoard
          midCols={2}
          masonry={BOARD_COLUMNS.map((col) =>
            col.map((c) => ({
              ...c,
              icon: "trophy",
              iconVariant: "default" as const,
              unitKind: "FILM",
              weightText: null
            }))
          )}
          keyboardCategoryId={null}
          setKeyboardCategoryId={noop}
          canDraftAction
          hoveredNominationIds={new Set()}
          onNomineeClick={noop}
          onNomineeDoubleClick={noop}
        />
      </Box>
      <Cell label="card edges, gaps between and across columns" span>
        <Box className="dr-frame specimen-board" data-turn="mine" data-results="live">
          <DraftMasonryBoard
            midCols={2}
            masonry={EDGE_COLUMNS.map((col) =>
              col.map((c) => ({
                ...c,
                icon: "trophy",
                iconVariant: "default" as const,
                unitKind: "FILM",
                weightText: null
              }))
            )}
            keyboardCategoryId={null}
            setKeyboardCategoryId={noop}
            canDraftAction
            hoveredNominationIds={new Set()}
            onNomineeClick={noop}
            onNomineeDoubleClick={noop}
          />
        </Box>
      </Cell>
      <Cell label="icon audit: punchout on every pill state, plain and punchout" span>
        <DraftIconRow />
      </Cell>
    </Box>
  );
}

export function SpecimenScreen() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const navLinksRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  // The shell header shows its drawer variant on a phone and never the inline one, so a
  // phone capture shows only the variants the app produces at that width.
  const [phone] = useState(() => window.matchMedia("(max-width: 600px)").matches);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    installForcedStateRules();
    for (const cell of root.querySelectorAll("[data-force]")) {
      const target = cell.querySelector(
        "button, a[href], input, textarea, [role='combobox']"
      );
      const states = (cell.getAttribute("data-force") ?? "").split(" ").filter(Boolean);
      if (target) forceStates(target, states as ForcedState[], cell);
    }
    // Nav links are forced one by one: the first idle link hovered, the next focused.
    const idleLinks = root.querySelectorAll(".site-nav .nav-link:not(.active)");
    if (idleLinks[0]) forceStates(idleLinks[0], ["hover"], root);
    if (idleLinks[1]) forceStates(idleLinks[1], ["focus"], root);
    for (const pill of FORCED_PILLS) {
      const target = root.querySelector(`[aria-label="${pill.label}"]`);
      if (target) forceStates(target, pill.states, target.closest(".dr-card") ?? root);
    }
    applySpecimenHooks(root);
    setReady(true);
  }, []);

  return (
    <Box className="page">
      <Box
        className="page-inner specimen"
        ref={rootRef}
        data-specimen={SPECIMEN_MARKER}
        data-specimen-ready={ready ? "true" : "false"}
      >
        <Title variant="page">Component specimen</Title>

        <SampleCard />

        <Box className="specimen-section">
          <Title variant="section">Header and navigation</Title>
          {phone ? null : (
            <>
              <Cell label="account menu open">
                <Box className="specimen-frame">
                  <StaticHeader user={SPECIMEN_USER_SHORT} navMode="inline" menuOpen />
                </Box>
              </Cell>
              <Cell label="logged out">
                <Box className="specimen-headerCell">
                  <StaticHeader user={null} navMode="inline" />
                </Box>
              </Cell>
              <Cell label="logged in, long username">
                <Box className="specimen-headerCell">
                  <StaticHeader user={SPECIMEN_USER} navMode="inline" />
                </Box>
              </Cell>
            </>
          )}
          <Cell label="logged in, drawer navigation">
            <Box className="specimen-headerCell">
              <StaticHeader user={SPECIMEN_USER_SHORT} navMode="drawer" />
            </Box>
          </Cell>
          {phone ? (
            <Cell label="logged out, drawer navigation">
              <Box className="specimen-headerCell">
                <StaticHeader user={null} navMode="drawer" />
              </Box>
            </Cell>
          ) : (
            <Cell label="navigation, active item" hook="nav">
              <Box className="specimen-headerCell">
                <ShellPrimaryNav
                  navMode="inline"
                  navLinksRef={navLinksRef}
                  links={NAV_LINKS}
                />
              </Box>
            </Cell>
          )}
          <Cell label="wordmark" hook="wordmark">
            <Wordmark />
          </Cell>
        </Box>

        <Section title="Buttons">
          <ButtonMatrix />
        </Section>

        <Section title="Links">
          <Cell label="default">
            <Text>
              <Anchor href="#specimen-links">Read the rules</Anchor>
            </Text>
          </Cell>
          <Cell label="hover" force={["hover"]}>
            <Text>
              <Anchor href="#specimen-links">Read the rules</Anchor>
            </Text>
          </Cell>
          <Cell label="focus" force={["focus"]}>
            <Text>
              <Anchor href="#specimen-links">Read the rules</Anchor>
            </Text>
          </Cell>
        </Section>

        <Section title="Form controls">
          <FormMatrix />
        </Section>

        <Section title="Selection controls">
          <SelectionMatrix />
        </Section>

        <Box className="specimen-section">
          <Title variant="section">Nominee pills</Title>
          <PillBoard />
        </Box>

        <Section title="Appearance" wide>
          <AppearanceMatrix vertical={phone} />
        </Section>

        <Section title="Cards" wide>
          <Cell label="standard" hook="card:standard">
            <StandardCard>
              <Stack gap="var(--fo-space-xs)">
                <Title variant="card">Friday Night Film Club</Title>
                <Text variant="meta">{FILM_TITLES[3]}</Text>
              </Stack>
            </StandardCard>
          </Cell>
          <Cell label="hero" hook="card:hero">
            <HeroCard>
              <Title variant="hero">Fantasy Oscars</Title>
              <Text variant="helper" className="baseline-heroTagline">
                Draft the nominees. Win on ceremony night.
              </Text>
            </HeroCard>
          </Cell>
          <Cell label="season" hook="card:season">
            <LeagueSeasonsSection
              leagueId={1}
              leagueName="Friday Night Film Club"
              canCreateSeason
              seasons={SEASONS}
            />
          </Cell>
          <Cell label="updates">
            <StandardCard className="baseline-updatesCard">
              <Stack gap="var(--fo-space-dense-2)">
                <Text variant="meta">2/10/2035</Text>
                <Title variant="card">Nominees are in</Title>
                <Text>All twenty-four categories are open for drafting.</Text>
              </Stack>
            </StandardCard>
          </Cell>
          <Cell label="action" hook="card:action">
            <ActionCard>
              <Title variant="card">Start a league</Title>
            </ActionCard>
          </Cell>
        </Section>

        <Section title="Status pills">
          {STATUS_LABELS.map(({ label, note }) => {
            const { tone, mark } = statusTone(label);
            return (
              <Cell key={label} label={note} hook={`chip:${note}`}>
                <Group>
                  <StatusPill tone={tone} mark={mark}>
                    {label}
                  </StatusPill>
                </Group>
              </Cell>
            );
          })}
          <Cell label="winner" hook="chip:winner">
            <Group>
              <WinnerChip />
            </Group>
          </Cell>
        </Section>

        <Section title="Overlays" wide>
          <Cell label="modal" hook="modal">
            <Box className="specimen-frame is-tall">
              <Modal
                opened
                onClose={noop}
                title="Confirm draft pick"
                withinPortal={false}
                trapFocus={false}
                lockScroll={false}
                returnFocus={false}
                closeOnEscape={false}
                closeOnClickOutside={false}
                transitionProps={{ duration: 0 }}
              >
                <Stack gap="var(--fo-space-md)">
                  <Text>Draft {LONG_FILM_TITLE} with pick 14?</Text>
                  <Group justify="flex-end">
                    <Button variant="ghost">Cancel</Button>
                    <Button variant="primary">Confirm</Button>
                  </Group>
                </Stack>
              </Modal>
            </Box>
          </Cell>
          <Cell label="menu" hook="menu">
            {/* Tall: the phone's 44px items need the room. */}
            <Box className="specimen-frame is-tall">
              <Menu
                opened
                withinPortal={false}
                position="bottom-start"
                hideDetached={false}
                middlewares={{ flip: false, shift: false }}
              >
                <Menu.Target>
                  <Box component="span" className="specimen-target">
                    <Button variant="secondary">Draft options</Button>
                  </Box>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Draft</Menu.Label>
                  <Menu.Item>Pause draft</Menu.Item>
                  {/* Held in its hover state by class: the menu re-renders as it positions. */}
                  <Menu.Item className="fo-force-hover">Copy invite link</Menu.Item>
                  <Menu.Divider />
                  <Menu.Item color="red">Cancel draft</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Box>
          </Cell>
          <Cell label="toast" hook="toast">
            <Box className="specimen-frame is-toast">
              <Notification title="Pick confirmed" withCloseButton onClose={noop}>
                {LONG_FILM_TITLE} is yours.
              </Notification>
            </Box>
          </Cell>
          <Cell label="tooltip">
            <Box className="specimen-frame is-short">
              <Tooltip
                opened
                label="Open navigation"
                withinPortal={false}
                position="bottom-start"
                transitionProps={{ duration: 0 }}
                middlewares={{ flip: false, shift: false }}
              >
                <Box component="span" className="specimen-target">
                  <Button variant="secondary">Menu</Button>
                </Box>
              </Tooltip>
            </Box>
          </Cell>
        </Section>

        <DraftSlice phone={phone} />

        <Section title="Empty and error states" wide>
          <Cell label="empty state" hook="empty-state">
            <EmptyState>No leagues yet. Create one to get started.</EmptyState>
          </Cell>
          <Cell label="error state">
            <PageError message="We could not load this league." requestId="req-7f3a91" />
          </Cell>
        </Section>

        <Section title="Banners and content" wide>
          <Cell label="banners" span hook="banners">
            <BannerStackScreen banners={BANNERS} onDismiss={noop} />
          </Cell>
          <Cell label="markdown" hook="markdown">
            <Markdown tree={MARKDOWN_SAMPLE_TREE} />
          </Cell>
        </Section>

        <Box className="specimen-section">
          <Title variant="section">Typography</Title>
          <Title variant="page">Page title</Title>
          <Title variant="section">Section heading</Title>
          <Title variant="card">Card title</Title>
          <Text>
            Body text: a league of friends drafts the nominees before ceremony night.
          </Text>
          <Text variant="meta">Meta text: Golden Reel Awards 2035</Text>
          <Text variant="helper">Helper text under a control.</Text>
          <Text component="span" className="specimen-numerals">
            0123456789 · 24 · 3:45 · 14/24
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
