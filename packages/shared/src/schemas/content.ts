import { z } from "zod";

const contentKey = z.string().trim().min(1, "Key is required");

/** `/content/.../:key` */
export const contentKeyParams = z.object({ key: contentKey });

/** `/content/dynamic/:key`; banners have their own route. */
export const contentDynamicParams = z.object({
  key: contentKey.refine((k) => k !== "banner", "Use /content/banners for banner content")
});
