import React from "react";
import ReactDOM from "react-dom/client";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { App } from "./app/App";
import "virtual:fo-fonts.css";
import "virtual:fo-brand.css";
import "./styles.css";
import { AppProviders } from "./ui/AppProviders";
import { removeLegacyAuthTokens } from "./lib/legacyAuthStorage";
import { buildEnabledBrands, isTestBuild } from "./orchestration/brand/buildFlags";
import { createColorSchemeManager } from "./orchestration/brand/colorSchemeManager";

removeLegacyAuthTokens();

// The pre-paint script (brand-init.js) sets `data-brand` and
// `data-mantine-color-scheme` before the first paint; the manager reads them and
// persists nothing.
const colorSchemeManager = createColorSchemeManager({
  testOverride: isTestBuild(),
  enabled: buildEnabledBrands()
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProviders colorSchemeManager={colorSchemeManager}>
      <App />
    </AppProviders>
  </React.StrictMode>
);
