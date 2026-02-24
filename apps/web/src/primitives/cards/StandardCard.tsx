import { Box } from "@ui";

export type StandardCardProps = {
  interactive?: boolean;
  tone?: "default" | "nested";
  className?: string;
  children?: React.ReactNode;
  // Polymorphic props (Link, button, etc.) are passed through to Mantine Box.
  [key: string]: unknown;
};

export function StandardCard(props: StandardCardProps) {
  const { interactive, tone = "default", className, ...rest } = props;
  return (
    <Box
      {...rest}
      data-tone={tone}
      className={[
        "baseline-card",
        "baseline-standardCard",
        interactive ? "isInteractive" : "",
        className
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
