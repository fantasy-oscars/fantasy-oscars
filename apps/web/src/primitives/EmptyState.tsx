import { Box } from "@ui";

export type EmptyStateProps = {
  children?: React.ReactNode;
};

/** A deliberate placeholder for a list or section that has nothing to show. */
export function EmptyState(props: EmptyStateProps) {
  return <Box className="baseline-emptyState">{props.children}</Box>;
}
