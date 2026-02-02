import { Link } from "react-router-dom";
import { Box, Button, Group, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import type { DraftRoomOrchestration } from "../../orchestration/draft";
import { FormStatus } from "../../ui/forms";
import { NomineePill } from "../../components/NomineePill";
import { computeRoundPickLabel } from "../../decisions/draft";

export function DraftRoomScreen(props: { o: DraftRoomOrchestration }) {
  const { o } = props;

  if (o.state.loadingInitial) {
    return (
      <Box component="section" className="draft-shell">
        <Box className="status status-loading" role="status">
          <Box component="span" className="spinner" aria-hidden="true" />{" "}
          <Text span>Loading draft…</Text>
        </Box>
      </Box>
    );
  }

  if (o.state.error && !o.nav.backToSeasonHref) {
    return (
      <Box component="section" className="draft-shell">
        <Box className="status status-error" role="status">
          <Text span>{o.state.error}</Text>
          <Button type="button" variant="subtle" onClick={o.refresh}>
            Retry
          </Button>
        </Box>
      </Box>
    );
  }

  const cols = o.layout.showRosterOnly ? "minmax(0, 1fr)" : o.layout.boardCols;

  return (
    <Box component="section" className="draft-shell">
      <DraftHeader o={o} />

      <Box className="draft-main" style={{ ["--draft-cols" as never]: cols }}>
        {!o.layout.showRosterOnly && o.layout.rails.ledger.visible ? (
          <DraftLedger o={o} />
        ) : null}

        <Box className="draft-center">
          {o.layout.showRosterOnly ? (
            <RosterBoard o={o} />
          ) : o.header.view === "roster" ? (
            <RosterBoard o={o} />
          ) : (
            <DraftBoard o={o} />
          )}
        </Box>

        {!o.layout.showRosterOnly && o.layout.rails.myRoster.visible ? (
          <MyRosterRail o={o} />
        ) : null}

        {!o.layout.showRosterOnly && o.layout.rails.autodraft.visible ? (
          <AutoDraftRail o={o} />
        ) : null}
      </Box>

      {!o.layout.showRosterOnly &&
      o.layout.phase !== "PRE" &&
      o.layout.rails.ledger.collapsed ? (
        <UnstyledButton
          type="button"
          className="rail-handle rail-handle-left"
          onClick={o.layout.rails.ledger.show}
        >
          Ledger
        </UnstyledButton>
      ) : null}
      {!o.layout.showRosterOnly &&
      o.layout.phase !== "PRE" &&
      o.layout.rails.myRoster.collapsed ? (
        <UnstyledButton
          type="button"
          className="rail-handle rail-handle-right rail-handle-right-1"
          onClick={o.layout.rails.myRoster.show}
        >
          My roster
        </UnstyledButton>
      ) : null}
      {!o.layout.showRosterOnly && o.layout.rails.autodraft.collapsed ? (
        <UnstyledButton
          type="button"
          className="rail-handle rail-handle-right rail-handle-right-2"
          onClick={o.layout.rails.autodraft.show}
        >
          Auto-draft
        </UnstyledButton>
      ) : null}

      {o.state.refreshing ? (
        <Box className="status status-loading" role="status">
          <Box component="span" className="spinner" aria-hidden="true" />{" "}
          <Text span>Refreshing…</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function DraftHeader(props: { o: DraftRoomOrchestration }) {
  const { o } = props;
  const { header } = o;

  const active = header.participants.find((p) => p.active) ?? null;
  const activeName = active?.label ?? "—";
  const rp =
    header.pickNumber && header.participants.length
      ? computeRoundPickLabel({
          pickNumber: header.pickNumber,
          seatCount: header.participants.length
        })
      : "—";

  const isMyTurn =
    Boolean(o.myRoster.seatNumber) && active?.seatNumber === o.myRoster.seatNumber;

  const hideDrafted = header.poolMode === "UNDRAFTED_ONLY";

  return (
    <Box className="draft-header" data-my-turn={isMyTurn ? "true" : "false"}>
      <Box className="draft-header-left">
        <Group className="draft-actions" gap="xs" wrap="wrap">
          {o.nav.backToSeasonHref ? (
            <Button component={Link} to={o.nav.backToSeasonHref} variant="subtle">
              Back to Season
            </Button>
          ) : null}

          <Button
            type="button"
            variant="subtle"
            onClick={() =>
              header.setPoolMode(hideDrafted ? "ALL_MUTED" : "UNDRAFTED_ONLY")
            }
          >
            {hideDrafted ? "Show drafted" : "Hide drafted"}
          </Button>

          <Button
            type="button"
            variant={header.view === "draft" ? "default" : "subtle"}
            onClick={() => header.setView("draft")}
            disabled={!header.canToggleView}
          >
            Draft board
          </Button>
          <Button
            type="button"
            variant={header.view === "roster" ? "default" : "subtle"}
            onClick={() => header.setView("roster")}
            disabled={!header.canToggleView}
          >
            Roster view
          </Button>

          {header.canStartDraft ? (
            <Button
              type="button"
              onClick={header.onStartDraft}
              disabled={header.startLoading}
            >
              {header.startLoading ? "Starting..." : "Start draft"}
            </Button>
          ) : null}
        </Group>

        {header.startResult ? (
          <FormStatus loading={header.startLoading} result={header.startResult} />
        ) : null}
      </Box>

      <Box className="draft-header-center">
        <Box className="turn-emblem">
          <Text className="turn-timer">{header.clockText}</Text>
          <Text className="turn-name">{activeName}</Text>
          <Text className="turn-rp">R-{rp}</Text>
        </Box>
      </Box>

      <Box className="draft-header-right">
        <Group className="draft-participants" gap="xs" justify="flex-end" wrap="wrap">
          {header.participants.length === 0 ? (
            <Text className="muted" size="sm">
              Seats will appear when the draft starts.
            </Text>
          ) : (
            header.participants.map((p) => (
              <Box
                key={p.seatNumber}
                component="span"
                className={`pill ${p.active ? "pill-active" : ""}`}
                title={`Seat ${p.seatNumber}`}
              >
                {p.label}
              </Box>
            ))
          )}
        </Group>
      </Box>
    </Box>
  );
}

function DraftLedger(props: { o: DraftRoomOrchestration }) {
  const { o } = props;
  return (
    <Box component="aside" className="draft-rail draft-ledger">
      <Box component="header" className="rail-header">
        <Group className="header-with-controls" justify="space-between" wrap="wrap">
          <Title order={4}>Ledger</Title>
          <Button
            type="button"
            variant="subtle"
            onClick={o.layout.rails.ledger.hide}
            aria-label="Close ledger"
          >
            ×
          </Button>
        </Group>
      </Box>
      <Box className="rail-body">
        <Stack className="ledger-list" gap="xs">
          {o.ledger.rows.map((r) => (
            <Box key={r.pickNumber} className={`ledger-row ${r.active ? "active" : ""}`}>
              <Text span className="mono">
                {r.roundPick}
              </Text>
              <Text span className={r.seatNumber ? "" : "muted"}>
                {r.seatLabel}
              </Text>
              <NomineePill
                label={r.label}
                icon={r.icon}
                state={r.label === "—" ? "disabled" : r.active ? "active" : "default"}
              />
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}

function DraftBoard(props: { o: DraftRoomOrchestration }) {
  const { o } = props;
  return (
    <Box className="draft-board">
      <Box className="category-columns">
        {o.pool.categories.map((c) => (
          <Box
            key={c.id}
            className={`category-card ${c.nominations.length ? "" : "empty"}`}
          >
            <Box className="category-header">
              <Text className="category-title">{c.title}</Text>
            </Box>
            <Box className="category-body">
              {c.emptyText ? (
                <Text className="muted small" size="sm">
                  {c.emptyText}
                </Text>
              ) : (
                c.nominations.map((n) => {
                  const state = n.selected ? "active" : n.muted ? "picked" : "default";
                  return (
                    <UnstyledButton
                      key={n.id}
                      type="button"
                      className="nominee-line"
                      onClick={() => o.pool.onSelectNomination(n.id)}
                      title={`Nomination #${n.id}`}
                    >
                      <NomineePill label={n.label} icon={c.icon} state={state} />
                    </UnstyledButton>
                  );
                })
              )}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function MyRosterRail(props: { o: DraftRoomOrchestration }) {
  const { o } = props;
  const { myRoster } = o;

  return (
    <Box component="aside" className="draft-rail draft-my-roster">
      <Box component="header" className="rail-header">
        <Group className="header-with-controls" justify="space-between" wrap="wrap">
          <Title order={4}>My roster</Title>
          <Button
            type="button"
            variant="subtle"
            onClick={o.layout.rails.myRoster.hide}
            aria-label="Close roster"
          >
            ×
          </Button>
        </Group>
      </Box>
      <Box className="rail-body stack-sm">
        {!myRoster.seatNumber ? (
          <Text className="muted">You are not seated in this draft.</Text>
        ) : null}

        {myRoster.picks.length === 0 ? (
          <Text className="muted">No picks yet.</Text>
        ) : (
          <Stack className="stack-sm" gap="xs">
            {myRoster.picks.map((p) => (
              <Box key={p.pickNumber} className="list-row">
                <Text span className="mono">
                  {p.roundPick}
                </Text>
                <NomineePill label={p.label} icon={p.icon} state="default" />
              </Box>
            ))}
          </Stack>
        )}

        <Box className="card nested">
          <Box component="header" className="header-with-controls">
            <Box>
              <Title order={5}>Pick</Title>
              <Text className="muted small" size="sm">
                Select a nominee in the pool, then confirm.
              </Text>
            </Box>
          </Box>

          {myRoster.selected ? (
            <Stack className="stack-sm" gap="xs">
              <Box className="list-row">
                <Text span className="muted">
                  Selected
                </Text>
                <NomineePill
                  label={myRoster.selected.label}
                  icon={myRoster.selected.icon}
                />
                <Button
                  type="button"
                  variant="subtle"
                  onClick={myRoster.clearSelection}
                  disabled={myRoster.pickLoading}
                >
                  Clear
                </Button>
              </Box>
              <Button
                type="button"
                onClick={myRoster.submitPick}
                disabled={!myRoster.canPick || myRoster.pickLoading}
              >
                {myRoster.pickLoading ? "Submitting..." : "Submit pick"}
              </Button>
            </Stack>
          ) : (
            <Text className="muted small" size="sm">
              Nothing selected.
            </Text>
          )}

          {myRoster.pickDisabledReason ? (
            <Box className="status status-error">{myRoster.pickDisabledReason}</Box>
          ) : null}
          <FormStatus loading={myRoster.pickLoading} result={myRoster.pickState} />
        </Box>
      </Box>
    </Box>
  );
}

function AutoDraftRail(props: { o: DraftRoomOrchestration }) {
  const { o } = props;
  return (
    <Box component="aside" className="draft-rail draft-autodraft">
      <Box component="header" className="rail-header">
        <Group className="header-with-controls" justify="space-between" wrap="wrap">
          <Title order={4}>Auto-draft</Title>
          <Button
            type="button"
            variant="subtle"
            onClick={o.layout.rails.autodraft.hide}
            aria-label="Close auto-draft"
          >
            ×
          </Button>
        </Group>
      </Box>
      <Box className="rail-body">
        <Text className="muted">Coming soon.</Text>
        <Text className="muted small" size="sm">
          You&apos;ll be able to configure per-user auto-draft behavior and review
          upcoming picks.
        </Text>
      </Box>
    </Box>
  );
}

function RosterBoard(props: { o: DraftRoomOrchestration }) {
  const { o } = props;
  const { seats, maxRows, rowsBySeat, emptyText } = o.rosterBoard;

  if (emptyText) return <Text className="muted">{emptyText}</Text>;

  return (
    <Box className="roster-board">
      <Box
        className="roster-grid"
        style={{ gridTemplateColumns: `repeat(${seats.length}, minmax(0, 1fr))` }}
      >
        {seats.map((s) => (
          <Box key={s.seatNumber} className="roster-col">
            <Box className="roster-col-header">
              <Text fw={700}>{s.username ?? `Seat ${s.seatNumber}`}</Text>
              <Text className="muted small" size="sm">
                Seat {s.seatNumber}
              </Text>
            </Box>
            <Box className="roster-col-body">
              {Array.from({ length: maxRows }, (_, idx) => {
                const p = (rowsBySeat.get(s.seatNumber) ?? [])[idx] ?? null;
                return (
                  <Box key={idx} className={`roster-row ${p ? "" : "muted"}`}>
                    {p ? (
                      <NomineePill label={p.label} icon={p.icon} state="default" />
                    ) : (
                      <Text className="muted" size="sm">
                        —
                      </Text>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
