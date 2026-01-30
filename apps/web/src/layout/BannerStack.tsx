import { useMemo, useState } from "react";
import { useBanners } from "../features/content/useBanners";
import { Markdown } from "../ui/Markdown";

const STORAGE_PREFIX = "fantasyoscars_banner_dismissed_";

function revisionFor(b: { updated_at?: string; published_at: string | null }) {
  return (
    (b.updated_at && b.updated_at.trim()) ||
    (b.published_at && b.published_at.trim()) ||
    ""
  );
}

function isDismissed(id: number, revision: string) {
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${id}`) === revision;
  } catch {
    return false;
  }
}

function dismiss(id: number, revision: string) {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${id}`, revision);
  } catch {
    // ignore
  }
}

function clearDismiss(id: number) {
  try {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${id}`);
  } catch {
    // ignore
  }
}

function bannerClass(variant: "info" | "warning" | "success" | "error") {
  if (variant === "error") return "banner banner-error";
  if (variant === "warning") return "banner banner-warning";
  if (variant === "success") return "banner banner-success";
  return "banner banner-info";
}

export function BannerStack() {
  const { view } = useBanners();
  const [dismissTick, setDismissTick] = useState(0);

  const banners = useMemo(() => {
    // Force recompute after localStorage dismiss without waiting on a refetch.
    void dismissTick;
    if (view.state !== "ready") return [];
    return view.banners.filter(
      (b) =>
        String(b.body_markdown ?? "").trim().length > 0 &&
        // Show/hide depends on dismissible + dismissed.
        // If a banner is not dismissible, it always shows (and we clear any stale dismiss state).
        (() => {
          const rev = revisionFor(b);
          if (!b.dismissible) {
            clearDismiss(b.id);
            return true;
          }
          return !isDismissed(b.id, rev);
        })()
    );
  }, [dismissTick, view]);

  if (view.state !== "ready") return null;
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
              onClick={() => {
                dismiss(b.id, revisionFor(b));
                setDismissTick((n) => n + 1);
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
