import { Box } from "@ui";

export function LandingLayout(props: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <Box className="baseline-landing">
      <Box className="baseline-landing-inner">
        <Box className="baseline-landing-grid">
          <Box className="baseline-landing-left">{props.left}</Box>
          <Box className="baseline-landing-right">{props.right}</Box>
        </Box>
      </Box>
    </Box>
  );
}
