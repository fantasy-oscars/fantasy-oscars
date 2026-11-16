import { Box } from "@ui";

/**
 * Home grid. DOM and focus order are fixed (hero, updates, aside) for every brand;
 * the brand's `--brand-home-areas` only changes where the regions sit. A brand that
 * places the create-league card in the hero shows it there, so it comes before the
 * update in both visual and focus order.
 */
export function LandingLayout(props: {
  hero: React.ReactNode;
  updates: React.ReactNode;
  aside: React.ReactNode;
}) {
  return (
    <Box className="baseline-landing">
      <Box className="baseline-landing-grid">
        <Box className="baseline-landing-hero">{props.hero}</Box>
        <Box className="baseline-landing-updates">{props.updates}</Box>
        <Box className="baseline-landing-aside">{props.aside}</Box>
      </Box>
    </Box>
  );
}
