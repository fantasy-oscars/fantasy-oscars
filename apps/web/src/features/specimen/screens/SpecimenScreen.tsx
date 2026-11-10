import { useEffect, useRef, useState, type ReactNode } from "react";
import {
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
  Text,
  TextInput,
  Title,
  Tooltip
} from "@ui";
import { Notification } from "@ui/Notification";
import { BRAND_CATALOG, BRAND_IDS, DARK_MODE } from "@fantasy-oscars/shared/brands";
import { AppearanceSection } from "@/features/account/ui/AppearanceSection";
import { deriveAppearanceView, type AppearanceState } from "@/decisions/appearance";
import { ShellHeader } from "@/app/chrome/ui/ShellHeader";
import { ShellPrimaryNav } from "@/app/chrome/ui/ShellPrimaryNav";
import { Wordmark } from "@/app/chrome/ui/Wordmark";
import { CategoryCard } from "@/features/draft/ui/CategoryCard";
import { CenterBuckle } from "@/features/draft/ui/CenterBuckle";
import { AvatarToken } from "@/features/draft/ui/AvatarToken";
import { DraftMasonryBoard } from "@/features/draft/ui/DraftMasonryBoard";
import { ActionCard, EmptyState, HeroCard, StandardCard } from "@/primitives";
import { statusTone } from "@/decisions/statusTone";
import { PageError } from "@/shared/page-state";
import { StatusPill } from "@/shared/pills";
import "@/primitives/baseline.css";
import "../specimen.css";
import {
  BOARD_COLUMNS,
  DISABLED_CARD_TITLE,
  DISABLED_PILLS,
  FILM_TITLES,
  FORCED_PILLS,
  HOVER_MATCH_IDS,
  LONG_FILM_TITLE,
  NAV_LINKS,
  PILL_CARD_TITLE,
  PILL_STATES,
  SELECT_OPTIONS,
  SPECIMEN_MARKER,
  SPECIMEN_USER,
  SPECIMEN_USER_SHORT,
  STATUS_LABELS
} from "../fixtures";
import { forceStates, installForcedStateRules, type ForcedState } from "../forceStates";

const noop = () => {};
const noopAsync = async () => {};

/** A labelled sample; `force` holds the interaction states to render on its control. */
function Cell(props: {
  label: string;
  force?: readonly ForcedState[];
  children: ReactNode;
}) {
  return (
    <Box
      className="specimen-cell"
      data-specimen-cell=""
      data-force={props.force?.join(" ")}
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
        <Cell key={cell.id} label={cell.label}>
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
          >
            <Button variant={variant} disabled={s.disabled}>
              {variant === "danger" ? "Delete league" : "Save changes"}
            </Button>
          </Cell>
        ))
      )}
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
  return (
    <>
      {states.map((s) => (
        <Cell key={`text-${s.name}`} label={`input, ${s.name}`} force={s.force}>
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
        <Cell key={`select-${s.name}`} label={`select, ${s.name}`} force={s.force}>
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
        <Cell key={`number-${s.name}`} label={`number input, ${s.name}`} force={s.force}>
          <NumberInput
            label="Pick timer (seconds)"
            defaultValue={90}
            error={s.error}
            disabled={s.disabled}
          />
        </Cell>
      ))}
      {states.map((s) => (
        <Cell key={`check-${s.name}`} label={`checkbox, ${s.name}`} force={s.force}>
          <Checkbox
            label="Allow auto-draft"
            defaultChecked={s.name !== "default"}
            error={s.error}
            disabled={s.disabled}
          />
        </Cell>
      ))}
    </>
  );
}

function PillBoard() {
  const p = PILL_STATES;
  const noClick = noop;
  const card = (
    props: Pick<
      React.ComponentProps<typeof CategoryCard>,
      "title" | "nominees" | "canDraftAction" | "categoryId"
    >
  ) => (
    <CategoryCard
      {...props}
      icon="trophy"
      iconVariant="default"
      unitKind="FILM"
      tooltipsEnabled={false}
      weightText={null}
      hoveredNominationIds={HOVER_MATCH_IDS}
      isKeyboardMode={false}
      setKeyboardMode={noop}
      onNomineeClick={noClick}
      onNomineeDoubleClick={noClick}
    />
  );
  return (
    <Box className="dr-frame" data-turn="mine" data-results="live">
      <Box className="specimen-grid is-wide">
        {card({
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
        {card({
          categoryId: "pill-disabled",
          title: DISABLED_CARD_TITLE,
          canDraftAction: false,
          nominees: DISABLED_PILLS
        })}
      </Box>
    </Box>
  );
}

function DraftHeaderStrip(props: {
  label: string;
  buckleClass: string;
  centerText: string;
  glyph: "timer" | null;
}) {
  return (
    <Cell label={props.label}>
      <Box className="specimen-headerCell">
        <Box className="dr-frame" data-turn="mine" data-results="live">
          <Box className="dr-header">
            <Box className="drh-row">
              <Group gap="var(--fo-space-8)">
                <AvatarToken label="avery" avatarKey="giraffe" active />
                <AvatarToken label="blake" avatarKey="bear" active={false} />
              </Group>
              <CenterBuckle
                roundNumber={3}
                pickNumber={14}
                centerText={props.centerText}
                centerGlyph={props.glyph}
                className={props.buckleClass}
                measureText={null}
                isTimerDraft
                maxHandleLengthPx={140}
              />
            </Box>
          </Box>
        </Box>
      </Box>
    </Cell>
  );
}

function DraftSlice() {
  return (
    <Box className="specimen-section">
      <Title variant="section">Draft board</Title>
      <Box className="specimen-grid is-wide">
        <DraftHeaderStrip
          label="on the clock"
          buckleClass=""
          centerText="avery"
          glyph={null}
        />
        <DraftHeaderStrip
          label="countdown, normal"
          buckleClass="is-countdown pulse-gold"
          centerText="28s left"
          glyph="timer"
        />
        <DraftHeaderStrip
          label="countdown, urgent"
          buckleClass="is-countdown pulse-red"
          centerText="4s left"
          glyph="timer"
        />
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
    for (const pill of FORCED_PILLS) {
      const target = root.querySelector(`[aria-label="${pill.label}"]`);
      if (target) forceStates(target, pill.states, target.closest(".dr-card") ?? root);
    }
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
            <Cell label="navigation, active item">
              <Box className="specimen-headerCell">
                <ShellPrimaryNav
                  navMode="inline"
                  navLinksRef={navLinksRef}
                  links={NAV_LINKS}
                />
              </Box>
            </Cell>
          )}
          <Cell label="wordmark">
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

        <Box className="specimen-section">
          <Title variant="section">Nominee pills</Title>
          <PillBoard />
        </Box>

        <Section title="Appearance" wide>
          <AppearanceMatrix vertical={phone} />
        </Section>

        <Section title="Cards" wide>
          <Cell label="standard">
            <StandardCard>
              <Stack gap="var(--fo-space-xs)">
                <Title variant="card">Friday Night Film Club</Title>
                <Text variant="meta">{FILM_TITLES[3]}</Text>
              </Stack>
            </StandardCard>
          </Cell>
          <Cell label="hero">
            <HeroCard>
              <Title variant="hero">Fantasy Oscars</Title>
              <Text variant="helper" className="baseline-heroTagline">
                Draft the nominees. Win on ceremony night.
              </Text>
            </HeroCard>
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
          <Cell label="action">
            <ActionCard>
              <Title variant="card">Start a league</Title>
            </ActionCard>
          </Cell>
        </Section>

        <Section title="Status pills">
          {STATUS_LABELS.map(({ label, note }) => {
            const { tone, mark } = statusTone(label);
            return (
              <Cell key={label} label={note}>
                <Group>
                  <StatusPill tone={tone} mark={mark}>
                    {label}
                  </StatusPill>
                </Group>
              </Cell>
            );
          })}
        </Section>

        <Section title="Overlays" wide>
          <Cell label="modal">
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
          <Cell label="menu">
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
                  <Menu.Item>Copy invite link</Menu.Item>
                  <Menu.Divider />
                  <Menu.Item color="red">Cancel draft</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Box>
          </Cell>
          <Cell label="toast">
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

        <DraftSlice />

        <Section title="Empty and error states" wide>
          <Cell label="empty state">
            <EmptyState>No leagues yet. Create one to get started.</EmptyState>
          </Cell>
          <Cell label="error state">
            <PageError message="We could not load this league." requestId="req-7f3a91" />
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
