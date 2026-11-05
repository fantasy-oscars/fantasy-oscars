import { bannerIconName, type BannerVariant } from "@/decisions/chrome/bannerColor";
import { Text } from "@ui";

/** Variant glyph for the `icon` prop of an Alert; colour comes from the Alert. */
export function AlertIcon(props: { variant: BannerVariant }) {
  return (
    <Text component="span" className="mi-icon is-inherit" aria-hidden="true">
      {bannerIconName(props.variant)}
    </Text>
  );
}
