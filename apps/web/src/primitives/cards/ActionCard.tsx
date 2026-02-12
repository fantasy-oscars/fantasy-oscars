import { Box } from "@ui";

export type ActionCardProps = {
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
};

export function ActionCard(props: ActionCardProps) {
  const { className, ...rest } = props;
  return (
    <Box
      {...rest}
      className={["baseline-card", "baseline-actionCard", className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
