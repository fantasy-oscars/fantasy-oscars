import { Anchor, Text } from "@mantine/core";
import { StaticPage } from "../../ui/StaticPage";

export function FeedbackScreen() {
  return (
    <StaticPage title="Feedback">
      <Text>
        We&apos;re dogfooding actively. If something feels off, tell us what you expected
        to happen and what actually happened.
      </Text>
      <Text>
        Email:{" "}
        <Anchor href="mailto:feedback@fantasy-oscars.com">
          feedback@fantasy-oscars.com
        </Anchor>
      </Text>
    </StaticPage>
  );
}
