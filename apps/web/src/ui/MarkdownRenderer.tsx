import { Anchor, Blockquote, Box, Code, Divider, List, Stack, Text, Title } from "@mantine/core";
import { Link as RouterLink } from "react-router-dom";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, Content, PhrasingContent, ListItem, Definition } from "mdast";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { CodeBlock } from "./CodeBlock";

type Props = {
  markdown: string;
};

function applyTypographyReplacementsToText(value: string) {
  // Minimal, explicit typography normalization.
  // - We intentionally do NOT change how characters are rendered elsewhere in the app.
  // - We only rewrite the Markdown author's ASCII punctuation into typographic glyphs.
  // - This runs only on Markdown "text" nodes (never code/inlineCode).
  return (
    value
      // Em dash: users often type `---`.
      .replaceAll("---", "\u2014")
      // Ellipsis: `...`.
      .replaceAll("...", "\u2026")
  );
}

function applyTypographyReplacements(tree: Root) {
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; value?: unknown; children?: unknown[] };

    if (n.type === "text" && typeof n.value === "string") {
      n.value = applyTypographyReplacementsToText(n.value);
    }

    // Never touch code surfaces.
    if (n.type === "code" || n.type === "inlineCode") return;

    if (Array.isArray(n.children)) {
      for (const child of n.children) visit(child);
    }
  };

  visit(tree);
  return tree;
}

function isExternalUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function isSafeUrl(url: string) {
  // Basic guardrail: never allow `javascript:`/`data:` links through.
  return !/^(javascript|data):/i.test(url.trim());
}

type DefinitionsMap = Map<string, Definition>;

function normalizeDefinitionId(id: string) {
  return id.trim().toLowerCase();
}

function collectDefinitions(tree: Root): DefinitionsMap {
  const defs: DefinitionsMap = new Map();

  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; children?: unknown[]; identifier?: unknown; url?: unknown; title?: unknown };

    if (n.type === "definition" && typeof n.identifier === "string") {
      const id = normalizeDefinitionId(n.identifier);
      // mdast Definition also includes `url` and optional `title`.
      defs.set(id, n as unknown as Definition);
      return;
    }

    if (Array.isArray(n.children)) {
      for (const child of n.children) visit(child);
    }
  };

  visit(tree);
  return defs;
}

function renderInline(
  nodes: PhrasingContent[] | undefined,
  keyPrefix: string,
  definitions: DefinitionsMap
) {
  if (!nodes || nodes.length === 0) return null;

  return nodes.map((node, i) => {
    const key = `${keyPrefix}-inl-${i}`;
    switch (node.type) {
      case "text":
        return node.value;
      case "strong":
        return (
          <Text key={key} span fw={700} inherit>
            {renderInline(node.children, key, definitions)}
          </Text>
        );
      case "emphasis":
        return (
          <Text key={key} span fs="italic" inherit>
            {renderInline(node.children, key, definitions)}
          </Text>
        );
      case "delete":
        return (
          <Text key={key} span td="line-through" inherit>
            {renderInline(node.children, key, definitions)}
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
        const content = renderInline(node.children, key, definitions);
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
      case "linkReference": {
        const def = definitions.get(normalizeDefinitionId(node.identifier));
        if (!def) {
          // If the definition is missing, render the visible text as plain text.
          return renderInline(node.children, key, definitions);
        }
        if (!isSafeUrl(def.url)) return null;
        const content = renderInline(node.children, key, definitions);
        if (isExternalUrl(def.url)) {
          return (
            <Anchor key={key} href={def.url} target="_blank" rel="noopener noreferrer">
              {content}
            </Anchor>
          );
        }
        return (
          <Anchor key={key} component={RouterLink} to={def.url}>
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

function renderBlocks(nodes: Content[] | undefined, keyPrefix: string, definitions: DefinitionsMap) {
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
              {renderInline(node.children as PhrasingContent[], key, definitions)}
            </Text>
          );
          return;
        }

        out.push(
          <Title key={key} order={depth} style={{ marginTop: 0 }} mb="xs">
            {renderInline(node.children as PhrasingContent[], key, definitions)}
          </Title>
        );
        return;
      }
      case "paragraph": {
        out.push(
          <Text key={key} component="p" style={{ margin: 0 }} mb="sm">
            {renderInline(node.children as PhrasingContent[], key, definitions)}
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
                {renderBlocks(li.children as Content[], `${key}-li-${liIndex}`, definitions)}
              </List.Item>
            ))}
          </List>
        );
        return;
      }
      case "blockquote": {
        out.push(
          <Blockquote key={key} mb="sm">
            <Stack gap={0}>{renderBlocks(node.children, key, definitions)}</Stack>
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
        out.push(<Divider key={key} my="sm" />);
        return;
      case "definition":
        // Definitions exist only to support reference-style links; never render them.
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
  const { tree, definitions } = useMemo(() => {
    const parsed = unified().use(remarkParse).use(remarkGfm).parse(props.markdown) as Root;
    return {
      tree: applyTypographyReplacements(parsed),
      definitions: collectDefinitions(parsed),
    };
  }, [props.markdown]);

  return <Stack gap={0}>{renderBlocks(tree.children, "md", definitions)}</Stack>;
}
