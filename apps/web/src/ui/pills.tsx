import { Box } from "@mantine/core";

export function StatusPill(props: { children: React.ReactNode }) {
  return (
    <Box component="span" className="pill">
      {props.children}
    </Box>
  );
}

export function CommissionerPill() {
  return <StatusPill>Commissioner</StatusPill>;
}

