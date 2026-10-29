import { z } from "zod";

const contentKey = z.string().trim().min(1, "Key is required");

/** `/content/static/:key` */
export const contentStaticParams = z.object({ key: contentKey });

/** `/content/dynamic/:key`; banners have their own route. */
export const contentDynamicParams = z.object({
  key: contentKey.refine((k) => k !== "banner", "Use /content/banners for banner content")
});
