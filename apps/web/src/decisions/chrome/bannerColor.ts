export type BannerVariant = "info" | "warning" | "success" | "error";

export function bannerColor(variant: BannerVariant): string {
  switch (variant) {
    case "warning":
      // Neutral ink: warning carries an icon and words, not a new hue.
      return "yellow";
    case "success":
      return "teal";
    case "error":
      return "red";
    case "info":
    default:
      return "gray";
  }
}

/** Material Symbols ligature for each variant, so severity never rests on colour alone. */
export function bannerIconName(variant: BannerVariant): string {
  switch (variant) {
    case "warning":
      return "warning";
    case "success":
      return "check_circle";
    case "error":
      return "error";
    case "info":
    default:
      return "info";
  }
}
