import { Link } from "react-router-dom";
import {
  Anchor,
  Box,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TmdbLogo,
  useMantineColorScheme
} from "@ui";

export function SiteFooter() {
  useMantineColorScheme(); // keep hook for future theme-driven footer tweaks

  return (
    <Box component="footer" className="site-footer">
      <Box component="nav" className="footer-grid" aria-label="Footer">
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="lg">
          <Stack gap="var(--fo-space-8)" className="footer-col" aria-label="Product">
            <Text variant="chromeHeading" component="h2" className="footer-col-title">
              Product
            </Text>
            <Stack gap="var(--fo-space-4)" className="footer-col-links">
              <Anchor component={Link} to="/about">
                About
              </Anchor>
              <Anchor component={Link} to="/how-it-works">
                How It Works
              </Anchor>
              <Anchor component={Link} to="/faq">
                FAQ
              </Anchor>
            </Stack>
          </Stack>

          <Stack gap="var(--fo-space-8)" className="footer-col" aria-label="Community">
            <Text variant="chromeHeading" component="h2" className="footer-col-title">
              Community
            </Text>
            <Stack gap="var(--fo-space-4)" className="footer-col-links">
              <Anchor component={Link} to="/contact">
                Contact
              </Anchor>
              <Anchor component={Link} to="/feedback">
                Feedback
              </Anchor>
              <Anchor component={Link} to="/code-of-conduct">
                Code of Conduct
              </Anchor>
            </Stack>
          </Stack>

          <Stack gap="var(--fo-space-8)" className="footer-col" aria-label="Legal">
            <Text variant="chromeHeading" component="h2" className="footer-col-title">
              Legal
            </Text>
            <Stack gap="var(--fo-space-4)" className="footer-col-links">
              <Anchor component={Link} to="/terms">
                Terms
              </Anchor>
              <Anchor component={Link} to="/privacy">
                Privacy
              </Anchor>
              <Anchor component={Link} to="/disclaimer">
                Disclaimer
              </Anchor>
            </Stack>
          </Stack>

          <Stack gap="var(--fo-space-8)" className="footer-col" aria-label="With">
            <Text variant="chromeHeading" component="h2" className="footer-col-title">
              With
            </Text>
            <Group className="footer-col-links" gap="sm">
              <Anchor
                className="footer-logo-link"
                href="https://www.themoviedb.org/"
                target="_blank"
                rel="noreferrer"
                aria-label="The Movie Database (TMDB)"
              >
                <TmdbLogo className="footer-logo" />
              </Anchor>
            </Group>
          </Stack>
        </SimpleGrid>
      </Box>

      <Text variant="chromeFineprint" className="footer-fineprint" ta="center">
        © 2026 Fantasy Oscars · Fan-run. Not affiliated with AMPAS.
      </Text>
    </Box>
  );
}

export function SiteFooterFineprintOnly() {
  return (
    <Box component="footer" className="site-footer">
      <Text variant="chromeFineprint" className="footer-fineprint" ta="center">
        © 2026 Fantasy Oscars · Fan-run. Not affiliated with AMPAS.
      </Text>
    </Box>
  );
}
