import { Code } from "@ui";

export function CodeBlock(props: { code: string; language?: string }) {
  const { code } = props;

  // Mantine `Code` renders a semantic code surface without emitting raw <pre>.
  // Keep this intentionally plain; visual treatment belongs to the baseline theme.
  return (
    <Code block className="fo-codeBlock">
      {code}
    </Code>
  );
}
