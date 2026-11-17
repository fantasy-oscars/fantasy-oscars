import { Anchor, Blockquote, Box, Code, Divider, List, Stack, Text, Title } from "@ui";
import { Link as RouterLink } from "react-router-dom";
import type { Root, Content, PhrasingContent, ListItem, Definition } from "mdast";
import type { ReactNode } from "react";
import { CodeBlock } from "./CodeBlock";

type Props = {
  /**
   * The parsed document: built from the repo's Markdown files at build time, or
   * returned by the API for admin-edited content. The client never parses Markdown
   * here, so the parser stays out of the shared bundle.
   */
  tree: Root | null | undefined;
  /**
   * Heading level that `#` renders at (default 2, never lower). Deeper headings
   * shift with it (`##` one level below, and so on, capped at h6). Raise it when
   * the Markdown sits under other headings, so the outline stays in order.
   * Above 2, the document's top heading takes the section size instead of the
   * page size.
   */
  headingBase?: number;
};

function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function isSafeUrl(url: string): boolean {
  // Basic guardrail: never allow `javascript:`/`data:` links through.
  return !/^(javascript|data):/i.test(url.trim());
}

type DefinitionsMap = Map<string, Definition>;

function normalizeDefinitionId(id: string): string {
  return id.trim().toLowerCase();
}

function collectDefinitions(tree: Root): DefinitionsMap {
  const defs: DefinitionsMap = new Map();

  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as {
      type?: string;
      children?: unknown[];
      identifier?: unknown;
      url?: unknown;
      title?: unknown;
    };

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
): ReactNode[] {
  if (!nodes || nodes.length === 0) return [];

  return nodes.map((node, i) => {
    const key = `${keyPrefix}-inl-${i}`;
    switch (node.type) {
      case "text":
        return node.value;
      case "strong":
        return (
          <Text key={key} span fw="var(--fo-font-weight-bold)" inherit>
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
          <Code key={key} fz="var(--fo-font-size-sm)">
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

type HeadingContext = { base: number; topDepth: number };

/**
 * The rendered level of a Markdown heading: depth n sits at n + (base - 1), so `#`,
 * `##` and `###` stay distinct levels below the page title. Capped at h6.
 */
function markdownHeadingLevel(depth: number, base: number): 2 | 3 | 4 | 5 | 6 {
  return Math.min(6, depth + base - 1) as 2 | 3 | 4 | 5 | 6;
}

/**
 * Type steps from largest to smallest: the h2, h3 and h4 sizes, then small bold
 * capitals in the body face (smaller and a different case, so it stays distinct
 * from the h4 step). Deeper levels stay on the last step.
 */
const HEADING_STEPS = ["page", "section", "card", "caps"] as const;
type HeadingStep = (typeof HEADING_STEPS)[number];

/**
 * The size a heading takes follows its depth below the document's top heading, not
 * its rendered level, so the first level always gets a display size and each
 * deeper level steps down. Markdown nested under other headings (base above 2)
 * starts one step lower, at the section size.
 */
function markdownHeadingStep(depth: number, headings: HeadingContext): HeadingStep {
  const start = headings.base > 2 ? 1 : 0;
  const index = Math.max(0, depth - headings.topDepth) + start;
  return HEADING_STEPS[Math.min(HEADING_STEPS.length - 1, index)];
}

function topHeadingDepth(nodes: Content[] | undefined): number {
  let top = 6;
  for (const node of nodes ?? []) {
    if (node.type === "heading") top = Math.min(top, node.depth);
    else if (node.type === "blockquote")
      top = Math.min(top, topHeadingDepth(node.children));
    else if (node.type === "list")
      for (const li of node.children)
        top = Math.min(top, topHeadingDepth(li.children as Content[]));
  }
  return top;
}

function renderBlocks(
  nodes: Content[] | undefined,
  keyPrefix: string,
  definitions: DefinitionsMap,
  headings: HeadingContext
): ReactNode[] {
  if (!nodes || nodes.length === 0) return [];

  const out: ReactNode[] = [];

  nodes.forEach((node, i) => {
    const key = `${keyPrefix}-blk-${i}`;
    switch (node.type) {
      case "heading": {
        const level = markdownHeadingLevel(node.depth, headings.base);
        const step = markdownHeadingStep(node.depth, headings);
        const component = `h${level}` as const;
        const children = renderInline(
          node.children as PhrasingContent[],
          key,
          definitions
        );

        if (step === "caps") {
          // Below the display steps: bold body face, one size smaller, in capitals.
          out.push(
            <Text
              key={key}
              component={component}
              fw="var(--fo-font-weight-bold)"
              fz="var(--fo-font-size-xs)"
              tt="uppercase"
              m="var(--fo-space-0)"
              mb="xs"
            >
              {children}
            </Text>
          );
          return;
        }

        out.push(
          <Title key={key} order={level} variant={step} mt="var(--fo-space-0)" mb="xs">
            {children}
          </Title>
        );
        return;
      }
      case "paragraph": {
        out.push(
          <Text key={key} component="p" m="var(--fo-space-0)" mb="sm">
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
                {renderBlocks(
                  li.children as Content[],
                  `${key}-li-${liIndex}`,
                  definitions,
                  headings
                )}
              </List.Item>
            ))}
          </List>
        );
        return;
      }
      case "blockquote": {
        out.push(
          <Blockquote key={key} mb="sm">
            <Stack gap="var(--fo-space-0)">
              {renderBlocks(node.children, key, definitions, headings)}
            </Stack>
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
  const children = props.tree?.children ?? [];
  const definitions = props.tree
    ? collectDefinitions(props.tree)
    : new Map<string, Definition>();

  return (
    <Stack gap="var(--fo-space-0)">
      {renderBlocks(children, "md", definitions, {
        // Page-level titles must not come from Markdown, so the base is never h1.
        base: Math.max(2, Math.floor(props.headingBase ?? 2)),
        topDepth: topHeadingDepth(children)
      })}
    </Stack>
  );
}
