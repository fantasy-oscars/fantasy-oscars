import type { BannerRow } from "../../orchestration/chrome";
import { Alert, Box } from "@mantine/core";
import { Markdown } from "../../ui/Markdown";
import { bannerColor } from "../../decisions/chrome/bannerColor";

export function BannerStackScreen(props: {
  banners: BannerRow[];
  onDismiss: (id: number) => void;
}) {
  const { banners, onDismiss } = props;

  if (banners.length === 0) return null;

  return (
    <Box component="section" className="banner-stack" aria-label="Announcements">
      {banners.map((b) => (
        <Alert
          key={b.id}
          role="status"
          variant="light"
          color={bannerColor(b.variant)}
          withCloseButton={b.dismissible}
          closeButtonLabel="Dismiss announcement"
          onClose={b.dismissible ? () => onDismiss(b.id) : undefined}
          styles={{
            root: {
              justifyContent: "center"
            },
            body: {
              width: "100%",
              textAlign: "center"
            }
          }}
        >
          {/* Title is admin-only metadata; the banner shows only the content body. */}
          <Box style={{ width: "100%", textAlign: "center" }}>
            <Markdown markdown={b.body_markdown} />
          </Box>
        </Alert>
      ))}
    </Box>
  );
}
