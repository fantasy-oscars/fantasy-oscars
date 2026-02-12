export type BannerVariant = "info" | "warning" | "success" | "error";

export function bannerColor(variant: BannerVariant): string {
  switch (variant) {
    case "warning":
      // Closest to our brand gold without being visually loud.
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
