import { Anchor, Text } from "@mantine/core";
import { StaticPage } from "../../ui/StaticPage";

export function ContactScreen() {
  return (
    <StaticPage title="Contact">
      <Text>
        Email:{" "}
        <Anchor href="mailto:contact@fantasy-oscars.com">
          contact@fantasy-oscars.com
        </Anchor>
      </Text>
    </StaticPage>
  );
}
