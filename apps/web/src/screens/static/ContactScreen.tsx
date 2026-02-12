import { Anchor, Text } from "@ui";
import { StaticPage } from "@/shared/StaticPage";

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
