import React from "react";
import ReactDOM from "react-dom/client";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/700.css";
import "@fontsource/cinzel/400.css";
import "@fontsource/cinzel/700.css";
import { App } from "./App";
import "./styles.css";
import { AppProviders } from "./ui/AppProviders";

// Ensure `data-mantine-color-scheme` is set before the first paint.
// Our token bindings in `apps/web/src/styles.css` depend on this attribute.
//
// Mantine can set this attribute at runtime, but pre-setting it avoids a
// flash of unthemed content and keeps global CSS vars stable during hydration.
const COLOR_SCHEME_STORAGE_KEY = "mantine-color-scheme-value";
try {
  const stored = window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
  const initial = stored === "light" || stored === "dark" ? stored : "dark";
  document.documentElement.setAttribute("data-mantine-color-scheme", initial);
} catch {
  // Ignore if storage is unavailable (private mode) or DOM not ready.
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </React.StrictMode>
);
