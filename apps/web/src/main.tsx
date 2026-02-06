import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { Notifications } from "@mantine/notifications";
import "@mantine/notifications/styles.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/700.css";
import "@fontsource/cinzel/400.css";
import "@fontsource/cinzel/700.css";
import { App } from "./App";
import { fantasyOscarsTheme } from "./theme/theme";
import "./styles.css";
import { ConfirmProvider, RuntimeBannerProvider } from "./notifications";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={fantasyOscarsTheme} defaultColorScheme="dark">
      <Notifications position="bottom-right" />
      <RuntimeBannerProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </RuntimeBannerProvider>
    </MantineProvider>
  </React.StrictMode>
);
