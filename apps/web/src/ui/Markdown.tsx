import ReactMarkdown from "react-markdown";
import { Anchor, Blockquote, Box, Code, List, Text, Title } from "@mantine/core";
import type { ComponentProps } from "react";

export function Markdown(props: { markdown: string }) {
  const { markdown } = props;
  return (
    <Box className="prose">
      <ReactMarkdown
        components={{
          p: ({ children }) => <Text>{children}</Text>,
          h1: ({ children }) => (
            <Title order={1} mt="md">
              {children}
            </Title>
          ),
          h2: ({ children }) => (
            <Title order={2} mt="md">
              {children}
            </Title>
          ),
          h3: ({ children }) => (
            <Title order={3} mt="md">
              {children}
            </Title>
          ),
          h4: ({ children }) => (
            <Title order={4} mt="md">
              {children}
            </Title>
          ),
          h5: ({ children }) => (
            <Title order={5} mt="md">
              {children}
            </Title>
          ),
          h6: ({ children }) => (
            <Title order={6} mt="md">
              {children}
            </Title>
          ),
          a: (props: ComponentProps<"a">) => <Anchor {...props} />,
          ul: ({ children }) => <List>{children}</List>,
          ol: ({ children }) => <List type="ordered">{children}</List>,
          li: ({ children }) => <List.Item>{children}</List.Item>,
          blockquote: ({ children }) => <Blockquote>{children}</Blockquote>,
          code: ({ children }) => <Code>{children}</Code>
        }}
      >
        {markdown}
      </ReactMarkdown>
    </Box>
  );
}
