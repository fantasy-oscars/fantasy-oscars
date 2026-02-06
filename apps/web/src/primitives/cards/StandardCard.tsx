import { Box } from "@mantine/core";

export type StandardCardProps = {
  interactive?: boolean;
  className?: string;
  children?: React.ReactNode;
  // Polymorphic props (Link, button, etc.) are passed through to Mantine Box.
  [key: string]: unknown;
};

export function StandardCard(props: StandardCardProps) {
  const { interactive, className, ...rest } = props;
  return (
    <Box
      {...rest}
      className={["baseline-card", "baseline-standardCard", interactive ? "isInteractive" : "", className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
