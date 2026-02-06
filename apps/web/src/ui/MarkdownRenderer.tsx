import { Anchor, Blockquote, Box, Code, List, Stack, Text, Title } from "@mantine/core";
import { Link as RouterLink } from "react-router-dom";
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Root, Content, PhrasingContent, ListItem } from "mdast";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { CodeBlock } from "./CodeBlock";

type Props = {
  markdown: string;
};

function isExternalUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function isSafeUrl(url: string) {
  // Basic guardrail: never allow `javascript:`/`data:` links through.
  return !/^(javascript|data):/i.test(url.trim());
}

function renderInline(nodes: PhrasingContent[] | undefined, keyPrefix: string) {
  if (!nodes || nodes.length === 0) return null;

  return nodes.map((node, i) => {
    const key = `${keyPrefix}-inl-${i}`;
    switch (node.type) {
      case "text":
        return node.value;
      case "strong":
        return (
          <Text key={key} span fw={700} inherit>
            {renderInline(node.children, key)}
          </Text>
        );
      case "emphasis":
        return (
          <Text key={key} span fs="italic" inherit>
            {renderInline(node.children, key)}
          </Text>
        );
      case "delete":
        return (
          <Text key={key} span td="line-through" inherit>
            {renderInline(node.children, key)}
          </Text>
        );
      case "inlineCode":
        return (
          <Code key={key} style={{ fontSize: "0.95em" }}>
            {node.value}
          </Code>
        );
      case "link": {
        if (!isSafeUrl(node.url)) return null;
        const content = renderInline(node.children, key);
        if (isExternalUrl(node.url)) {
          return (
            <Anchor key={key} href={node.url} target="_blank" rel="noopener noreferrer">
              {content}
            </Anchor>
          );
        }
        return (
          <Anchor key={key} component={RouterLink} to={node.url}>
            {content}
          </Anchor>
        );
      }
      case "break":
        // Avoid raw <br/>; treat as a space to keep typography stable.
        return " ";
      default:
        // Ignore unsupported inline nodes (images, html, etc.).
        return null;
    }
  });
}

function renderBlocks(nodes: Content[] | undefined, keyPrefix: string) {
  if (!nodes || nodes.length === 0) return [];

  const out: ReactNode[] = [];

  nodes.forEach((node, i) => {
    const key = `${keyPrefix}-blk-${i}`;
    switch (node.type) {
      case "heading": {
        // Page-level titles must not come from Markdown; remap h1 -> h2.
        const depth = node.depth <= 1 ? 2 : node.depth;

        if (depth >= 5) {
          out.push(
            <Text key={key} fw={500} style={{ margin: 0 }} mb="xs">
              {renderInline(node.children as PhrasingContent[], key)}
            </Text>
          );
          return;
        }

        out.push(
          <Title key={key} order={depth} style={{ marginTop: 0 }} mb="xs">
            {renderInline(node.children as PhrasingContent[], key)}
          </Title>
        );
        return;
      }
      case "paragraph": {
        out.push(
          <Text key={key} component="p" style={{ margin: 0 }} mb="sm">
            {renderInline(node.children as PhrasingContent[], key)}
          </Text>
        );
        return;
      }
      case "list": {
        out.push(
          <List
            key={key}
            type={node.ordered ? "ordered" : undefined}
            spacing="xs"
            withPadding
            mb="sm"
          >
            {node.children.map((li: ListItem, liIndex: number) => (
              <List.Item key={`${key}-li-${liIndex}`}>
                {renderBlocks(li.children as Content[], `${key}-li-${liIndex}`)}
              </List.Item>
            ))}
          </List>
        );
        return;
      }
      case "blockquote": {
        out.push(
          <Blockquote key={key} mb="sm">
            <Stack gap={0}>{renderBlocks(node.children, key)}</Stack>
          </Blockquote>
        );
        return;
      }
      case "code": {
        out.push(
          <Box key={key} mb="sm">
            <CodeBlock code={node.value} language={node.lang ?? undefined} />
          </Box>
        );
        return;
      }
      case "thematicBreak":
        // Keep this minimal and typographic-first: drop horizontal rules from Markdown.
        return;
      case "html":
        // Explicitly ignore raw HTML for safety.
        return;
      default:
        // Ignore unsupported nodes (tables, images, etc.).
        return;
    }
  });

  // Avoid trailing spacing from `mb` props on the last element by trimming if it is a Text/Title/List/etc.
  // (Not critical, but keeps rhythm consistent.)
  return out;
}

export function MarkdownRenderer(props: Props) {
  const tree = useMemo(
    () => unified().use(remarkParse).parse(props.markdown) as Root,
    [props.markdown]
  );

  return <Stack gap={0}>{renderBlocks(tree.children, "md")}</Stack>;
}
