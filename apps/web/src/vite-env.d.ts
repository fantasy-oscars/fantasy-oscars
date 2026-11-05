/// <reference types="vite/client" />

declare module "virtual:fo-brand.css";
declare module "virtual:fo-fonts.css";

interface ImportMetaEnv {
  /** Set to "1" by the visual and e2e builds to include the `/__specimen` route. */
  readonly VITE_FO_ENABLE_SPECIMEN?: string;
}
