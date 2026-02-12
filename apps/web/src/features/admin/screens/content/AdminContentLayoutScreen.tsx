import type { ReactNode } from "react";
import { Box, Divider, Text, Title } from "@ui";
import "@/primitives/baseline.css";

export function AdminContentLayoutScreen(props: { children: ReactNode }) {
  return (
    <Box component="section">
      <Box component="header">
        <Title order={2} className="baseline-textHeroTitle">
          Content
        </Title>
        <Text className="baseline-textBody">Manage what the app says and shows.</Text>
      </Box>
      <Divider my="md" />
      {props.children}
    </Box>
  );
}
