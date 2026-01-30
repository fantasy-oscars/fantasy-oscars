import type { BannerRow } from "../../orchestration/chrome";
import { bannerClass } from "../../decisions/banners";
import { Markdown } from "../../ui/Markdown";

export function BannerStackScreen(props: {
  banners: BannerRow[];
  onDismiss: (id: number) => void;
}) {
  const { banners, onDismiss } = props;

  if (banners.length === 0) return null;

  return (
    <section className="banner-stack" aria-label="Announcements">
      {banners.map((b) => (
        <div key={b.id} className={bannerClass(b.variant)} role="status">
          <div className="banner-body">
            {/* Title is admin-only metadata; the banner shows only the content body. */}
            <Markdown markdown={b.body_markdown} />
          </div>
          {b.dismissible && (
            <button
              type="button"
              className="banner-dismiss"
              aria-label="Dismiss announcement"
              onClick={() => onDismiss(b.id)}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
