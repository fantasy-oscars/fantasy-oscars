import { StaticPage } from "../ui/StaticPage";
import { Anchor, Text } from "@mantine/core";

export function ContactPage() {
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
