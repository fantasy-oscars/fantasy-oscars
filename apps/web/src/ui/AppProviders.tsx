import type { PropsWithChildren } from "react";
import { MantineProvider } from "./MantineProvider";
import { Notifications } from "./notifications";

import { appCssVariablesResolver, appTheme } from "../theme";
import { ConfirmProvider, RuntimeBannerProvider } from "../notifications";

export function AppProviders(props: PropsWithChildren) {
  return (
    <MantineProvider
      theme={appTheme}
      cssVariablesResolver={appCssVariablesResolver}
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
