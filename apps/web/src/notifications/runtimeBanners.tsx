import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Alert, Box } from "@mantine/core";
import { bannerColor } from "../decisions/chrome/bannerColor";

export type RuntimeBanner = {
  id: string;
  message: string;
  variant: "info" | "warning" | "error";
  expires_at: number | null;
  dismissible: boolean;
};

type RuntimeBannerApi = {
  banners: RuntimeBanner[];
  dismiss: (id: string) => void;
};

const RuntimeBannerContext = createContext<RuntimeBannerApi | null>(null);

let globalPushRuntimeBanner:
  | ((b: Omit<RuntimeBanner, "id"> & { id?: string }) => void)
  | null = null;

export function pushRuntimeBanner(input: {
  id?: string;
  message: string;
  variant: "info" | "warning" | "error";
  // When set, banner persists until this time (ms since epoch) or manual dismiss.
  expires_at?: number | null;
  dismissible?: boolean;
}) {
  if (!globalPushRuntimeBanner) return;
  globalPushRuntimeBanner({
    id: input.id,
    message: input.message,
    variant: input.variant,
    expires_at: input.expires_at ?? Date.now() + 8000,
    dismissible: input.dismissible ?? true
  });
}

export function useRuntimeBanners() {
  const api = useContext(RuntimeBannerContext);
  if (!api) return { banners: [], dismiss: () => {} };
  return api;
}

export function RuntimeBannerProvider(props: { children: React.ReactNode }) {
  const { children } = props;
  const [banners, setBanners] = useState<RuntimeBanner[]>([]);

  const dismiss = useCallback((id: string) => {
    setBanners((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const push = useCallback(
    (b: Omit<RuntimeBanner, "id"> & { id?: string }) => {
      const id = b.id ?? `rt_${Math.random().toString(36).slice(2)}`;
      setBanners((prev) => {
        // Deduplicate by id.
        const next = [...prev.filter((x) => x.id !== id), { ...b, id }];
        return next;
      });
      if (b.expires_at) {
        window.setTimeout(() => dismiss(id), Math.max(0, b.expires_at - Date.now()));
      }
    },
    [dismiss]
  );

  globalPushRuntimeBanner = push;

  const api = useMemo(() => ({ banners, dismiss }), [banners, dismiss]);

  return (
    <RuntimeBannerContext.Provider value={api}>{children}</RuntimeBannerContext.Provider>
  );
}

export function RuntimeBannerStack() {
  const { banners, dismiss } = useRuntimeBanners();
  const now = Date.now();
  const visible = banners.filter((b) => !b.expires_at || b.expires_at > now);
  if (visible.length === 0) return null;

  return (
    <Box component="section" className="banner-stack" aria-label="Notifications">
      {visible.map((b) => (
        <Alert
          key={b.id}
          role="status"
          variant="light"
          color={bannerColor(b.variant)}
          withCloseButton={b.dismissible}
          closeButtonLabel="Dismiss notification"
          onClose={b.dismissible ? () => dismiss(b.id) : undefined}
          styles={{
            root: { justifyContent: "center" },
            body: { width: "100%", textAlign: "center" }
          }}
        >
          <Box style={{ width: "100%", textAlign: "center" }}>{b.message}</Box>
        </Alert>
      ))}
    </Box>
  );
}
