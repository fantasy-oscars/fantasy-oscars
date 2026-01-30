export type BannerVariant = "info" | "warning" | "success" | "error";

export function revisionFor(b: { updated_at?: string; published_at: string | null }) {
  return (
    (b.updated_at && b.updated_at.trim()) ||
    (b.published_at && b.published_at.trim()) ||
    ""
  );
}

export function bannerClass(variant: BannerVariant) {
  if (variant === "error") return "banner banner-error";
  if (variant === "warning") return "banner banner-warning";
  if (variant === "success") return "banner banner-success";
  return "banner banner-info";
}
