import { Box, Card, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import type { ResultsWinner } from "../../orchestration/results";
import type { Snapshot } from "../../lib/types";

export function ResultsScreen(props: {
  draftId: string;
  onDraftIdChange: (v: string) => void;
  state: "loading" | "unavailable" | "error" | "ready";
  error: string | null;
  winners: ResultsWinner[];
  snapshot: Snapshot | null;
  standings: Array<{ seat: number; points: number }>;
  picksWithResult: Array<{
    pick_number: number;
    seat_number: number;
    nomination_id: number;
    isWinner: boolean;
  }>;
}) {
  const {
    draftId,
    onDraftIdChange,
    state,
    error,
    winners,
    snapshot,
    standings,
    picksWithResult
  } = props;

  function renderState() {
    if (state === "loading") {
      return (
        <Box className="status status-loading" role="status">
          <Box component="span" className="spinner" aria-hidden="true" />{" "}
          <Text span>Loading results…</Text>
        </Box>
      );
    }
    if (state === "unavailable") {
      return (
        <Box className="status status-warning" role="status">
          Results are not available yet. Winners publish once the ceremony begins; drafts
          lock as soon as the first winner is entered.
        </Box>
      );
    }
    if (state === "error") {
      return (
        <Box className="status status-error" role="status">
          {error ?? "Could not load results right now. Try again shortly."}
        </Box>
      );
    }
    if (!snapshot) {
      return (
        <Box className="status status-error" role="status">
          No draft snapshot available.
        </Box>
      );
    }

    return (
      <Stack className="stack-lg" gap="lg">
        <Card className="card nested">
          <Group
            className="header-with-controls"
            justify="space-between"
            align="start"
            wrap="wrap"
          >
            <Box>
              <Title order={3}>Winners</Title>
              <Text className="muted">
                Final winners by category. Drafting is locked once the first winner is
                recorded.
              </Text>
            </Box>
          </Group>
          {winners.length === 0 ? (
            <Text className="muted">No winners published yet.</Text>
          ) : (
            <Box className="grid">
              {winners.map((w) => {
                const draftedBySeat = snapshot.picks.find(
                  (p) => p.nomination_id === w.nomination_id
                )?.seat_number;
                return (
                  <Box
                    key={`${w.category_edition_id}-${w.nomination_id}`}
                    className="list-row"
                  >
                    <Box>
                      <Text className="eyebrow" size="xs">
                        Category {w.category_edition_id}
                      </Text>
                      <Text fw={700}>Nomination #{w.nomination_id}</Text>
                    </Box>
                    <Group className="pill-list" wrap="wrap">
                      <Box component="span" className="pill">
                        Winner
                      </Box>
                      {draftedBySeat ? (
                        <Box component="span" className="pill">
                          Drafted by seat {draftedBySeat}
                        </Box>
                      ) : (
                        <Box component="span" className="pill muted">
                          Not drafted
                        </Box>
                      )}
                    </Group>
                  </Box>
                );
              })}
            </Box>
          )}
        </Card>

        <Card className="card nested">
          <Group
            className="header-with-controls"
            justify="space-between"
            align="start"
            wrap="wrap"
          >
            <Box>
              <Title order={3}>Season standings</Title>
              <Text className="muted">
                Points by draft seat (1 point per winner drafted).
              </Text>
            </Box>
          </Group>
          <Stack className="table" gap="xs">
            <Group className="table-row table-head" justify="space-between" wrap="nowrap">
              <Text span>Seat</Text>
              <Text span>Points</Text>
            </Group>
            {standings.map((row) => (
              <Group
                key={row.seat}
                className="table-row"
                justify="space-between"
                wrap="nowrap"
              >
                <Text span>Seat {row.seat}</Text>
                <Text span>{row.points}</Text>
              </Group>
            ))}
          </Stack>
        </Card>

        <Card className="card nested">
          <Group
            className="header-with-controls"
            justify="space-between"
            align="start"
            wrap="wrap"
          >
            <Box>
              <Title order={3}>Pick log</Title>
              <Text className="muted">Seat picks with win/loss markers.</Text>
            </Box>
          </Group>
          <Stack component="ul" className="list" gap="xs">
            {picksWithResult.map((p) => (
              <Box key={p.pick_number} component="li" className="list-row">
                <Box component="span" className="pill">
                  Seat {p.seat_number}
                </Box>
                <Text span>
                  Pick #{p.pick_number}: nomination {p.nomination_id}
                </Text>
                <Box component="span" className={`pill ${p.isWinner ? "" : "muted"}`}>
                  {p.isWinner ? "Winner" : "Not a winner"}
                </Box>
              </Box>
            ))}
          </Stack>
        </Card>
      </Stack>
    );
  }

  return (
    <Card className="card" component="section">
      <Group
        className="header-with-controls"
        justify="space-between"
        align="start"
        wrap="wrap"
      >
        <Box>
          <Title order={2}>Results</Title>
          <Text className="muted">
            Winners + standings (read-only). Drafting locks the moment the first winner is
            entered.
          </Text>
        </Box>
        <Group className="inline-actions" wrap="wrap">
          <TextInput
            label="Draft ID"
            value={draftId}
            onChange={(e) => onDraftIdChange(e.currentTarget.value)}
            inputMode="numeric"
            pattern="[0-9]*"
          />
        </Group>
      </Group>
      {renderState()}
    </Card>
  );
}
