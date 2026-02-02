import type { BannerRow } from "../../orchestration/chrome";
import { Box, Button } from "@mantine/core";
import { bannerClass } from "../../decisions/banners";
import { Markdown } from "../../ui/Markdown";

export function BannerStackScreen(props: {
  banners: BannerRow[];
  onDismiss: (id: number) => void;
}) {
  const { banners, onDismiss } = props;

  if (banners.length === 0) return null;

  return (
    <Box component="section" className="banner-stack" aria-label="Announcements">
      {banners.map((b) => (
        <Box key={b.id} className={bannerClass(b.variant)} role="status">
          <Box className="banner-body">
            {/* Title is admin-only metadata; the banner shows only the content body. */}
            <Markdown markdown={b.body_markdown} />
          </Box>
          {b.dismissible && (
            <Button
              type="button"
              className="banner-dismiss"
              variant="subtle"
              aria-label="Dismiss announcement"
              onClick={() => onDismiss(b.id)}
            >
              ×
            </Button>
          )}
        </Box>
      ))}
    </Box>
  );
}
