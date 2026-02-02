import { Link } from "react-router-dom";
import {
  Anchor,
  Box,
  Group,
  Image,
  SimpleGrid,
  Stack,
  Text,
  Title,
  useMantineColorScheme
} from "@mantine/core";
import tmdbLogoBlackUrl from "../assets/tmdb-black.svg";
import tmdbLogoWhiteUrl from "../assets/tmdb-white.svg";

export function SiteFooter() {
  const { colorScheme } = useMantineColorScheme();
  const tmdbLogoUrl = colorScheme === "dark" ? tmdbLogoWhiteUrl : tmdbLogoBlackUrl;

  return (
    <Box component="footer" className="site-footer">
      <Box component="nav" className="footer-grid" aria-label="Footer">
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="lg">
          <Stack gap={8} className="footer-col" aria-label="Product">
            <Title order={3} className="footer-col-title">
              Product
            </Title>
            <Stack gap={6} className="footer-col-links">
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

          <Stack gap={8} className="footer-col" aria-label="Community">
            <Title order={3} className="footer-col-title">
              Community
            </Title>
            <Stack gap={6} className="footer-col-links">
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

          <Stack gap={8} className="footer-col" aria-label="Legal">
            <Title order={3} className="footer-col-title">
              Legal
            </Title>
            <Stack gap={6} className="footer-col-links">
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

          <Stack gap={8} className="footer-col" aria-label="With">
            <Title order={3} className="footer-col-title">
              With
            </Title>
            <Group className="footer-col-links" gap="sm">
              <Anchor
                className="footer-logo-link"
                href="https://www.themoviedb.org/"
                target="_blank"
                rel="noreferrer"
                aria-label="The Movie Database (TMDB)"
              >
                <Image className="footer-logo" src={tmdbLogoUrl} alt="TMDB" />
              </Anchor>
            </Group>
          </Stack>
        </SimpleGrid>
      </Box>

      <Text className="footer-fineprint" ta="center" size="sm">
        © 2026 Fantasy Oscars · Fan-run. Not affiliated with AMPAS.
      </Text>
    </Box>
  );
}
