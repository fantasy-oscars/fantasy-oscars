import { Box } from "@mantine/core";

export type HeroCardProps = {
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
};

export function HeroCard(props: HeroCardProps) {
  const { className, ...rest } = props;
  return (
    <Box
      {...rest}
      className={["baseline-card", "baseline-heroCard", className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
