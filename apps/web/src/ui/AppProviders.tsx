import type { PropsWithChildren } from "react";
import type { MantineColorSchemeManager } from "@mantine/core";
import { MantineProvider } from "./MantineProvider";
import { Notifications } from "./notifications";

import { appCssVariablesResolver, appTheme } from "../theme";
import { ConfirmProvider, RuntimeBannerProvider } from "../notifications";

type AppProvidersProps = PropsWithChildren<{
  /** Supplied by the entry point; `ui/` does not import orchestration. */
  colorSchemeManager: MantineColorSchemeManager;
}>;

export function AppProviders(props: AppProvidersProps) {
  return (
    <MantineProvider
      theme={appTheme}
      cssVariablesResolver={appCssVariablesResolver}
      colorSchemeManager={props.colorSchemeManager}
      defaultColorScheme="dark"
      getRootElement={() =>
        typeof document !== "undefined" ? document.documentElement : undefined
      }
    >
      <Notifications position="bottom-right" />
      <RuntimeBannerProvider>
        <ConfirmProvider>{props.children}</ConfirmProvider>
      </RuntimeBannerProvider>
    </MantineProvider>
  );
}
