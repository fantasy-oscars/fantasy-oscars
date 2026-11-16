import type { ReactNode } from "react";
import { Box, Divider, Text, Title } from "@ui";
import "@/primitives/baseline.css";

export function AdminContentLayoutScreen(props: { children: ReactNode }) {
  return (
    <Box component="section">
      <Box component="header">
        <Title order={2} className="baseline-textHeroTitle admin-contentTitle">
          Announcements
        </Title>
        <Text className="baseline-textBody">
          The update on Home and the banners shown across the app. One Home announcement
          is published at a time; several banners can run at once.
        </Text>
      </Box>
      <Divider my="md" />
      {props.children}
    </Box>
  );
}
