import { Link } from "react-router-dom";
import { Box, Button, Divider, Stack, Text, Title } from "@ui";
import type { CircuitRulesView } from "@/orchestration/circuitRules";
import { OWNERSHIP_INSTANT_RULE, WINDOW_RULE } from "@/decisions/circuitRules";
import { circuitLeaguePath } from "@/lib/routes";
import {
  CircuitPageError,
  CircuitPageFrame,
  CircuitPageSkeleton
} from "@/features/circuitLeagues/ui/CircuitPageFrame";

// The list styling shared by the season pages.
const LIST_CLASS = ["circuit-list", "fo-listReset"].join(" ");

function Section(props: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Stack gap="sm" component="section" aria-labelledby={props.id}>
      <Title order={3} variant="section" id={props.id}>
        {props.title}
      </Title>
      <Divider />
      {props.children}
    </Stack>
  );
}

export function CircuitRulesScreen(props: { view: CircuitRulesView }) {
  const { view } = props;
  if (view.state === "loading") return <CircuitPageSkeleton label="Loading rules" />;
  if (view.state === "error") {
    return (
      <CircuitPageError
        title="Rules"
        notFound={view.notFound}
        message={view.message}
        requestId={view.requestId}
      />
    );
  }
  const { detail, rules } = view;
  const link = {
    leagueId: detail.league.id,
    leagueName: detail.league.name,
    circuitLeagueId: detail.circuit_league.id
  };
  return (
    <CircuitPageFrame
      title="Rules"
      subtitle={`${detail.circuit?.name ?? "Season"} · ${detail.league.name}`}
      actions={
        <Button component={Link} to={circuitLeaguePath(link)} variant="outline">
          Back to season
        </Button>
      }
    >
      <Section id="circuit-rules-instant" title="Who owns what, and when">
        <Text className="baseline-textBody">{OWNERSHIP_INSTANT_RULE}</Text>
      </Section>
      <Section id="circuit-rules-windows" title="Waiver windows">
        <Text className="baseline-textBody">{WINDOW_RULE}</Text>
      </Section>
      <Section id="circuit-rules-events" title="What counts">
        {rules.events.length === 0 ? (
          <Text className="baseline-textBody">
            No events count in this league, so nothing scores.
          </Text>
        ) : (
          <Box component="ul" className={LIST_CLASS} aria-label="Events">
            {rules.events.map((event) => (
              <Box key={event.id} component="li" className="circuit-row">
                <Box className="circuit-rowMain">
                  <Text fw="var(--fo-font-weight-bold)" className="baseline-wrapAnywhere">
                    {event.name}
                  </Text>
                  {event.ceremonies.map((c) => (
                    <Text key={c.name} variant="helper" className="baseline-wrapAnywhere">
                      {c.name} · {c.datesLabel}
                    </Text>
                  ))}
                </Box>
                <Text component="span" variant="meta" className="circuit-rowActions">
                  Points {event.weight}
                </Text>
              </Box>
            ))}
          </Box>
        )}
        {rules.eventsOff.length > 0 ? (
          <Text variant="helper">Not counted: {rules.eventsOff.join(", ")}.</Text>
        ) : null}
      </Section>
      <Section id="circuit-rules-points" title="Points">
        <Text className="baseline-textBody">
          {rules.scoring.nomination}; {rules.scoring.win}. A contender that is nominated
          and wins scores both.
        </Text>
        <Text className="baseline-textBody">
          Each score is multiplied by its event’s weight and its category’s weight.
        </Text>
      </Section>
      <Section id="circuit-rules-roster" title="Roster and limits">
        <Text className="baseline-textBody">{rules.rosterLine}</Text>
        {rules.categoriesNote ? (
          <Text variant="helper">{rules.categoriesNote}</Text>
        ) : null}
        <Box component="ul" className={LIST_CLASS} aria-label="Categories">
          {rules.categories.map((category) => (
            <Box key={category.id} component="li" className="circuit-row">
              <Text className="baseline-wrapAnywhere">{category.name}</Text>
              <Text component="span" variant="meta" className="circuit-rowActions">
                {[category.weight ? `Points ${category.weight}` : null, category.limit]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </Box>
          ))}
        </Box>
      </Section>
    </CircuitPageFrame>
  );
}
