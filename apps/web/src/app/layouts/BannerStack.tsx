import { useBannerOrchestration } from "@/orchestration/chrome";
import { BannerStackScreen } from "@/screens/chrome/BannerStackScreen";

export function BannerStack() {
  const { view, visibleBanners, dismissBanner } = useBannerOrchestration();
  if (view.state !== "ready") return null;
  return <BannerStackScreen banners={visibleBanners} onDismiss={dismissBanner} />;
}
