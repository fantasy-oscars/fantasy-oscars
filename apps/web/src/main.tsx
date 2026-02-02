import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/700.css";
import "@fontsource/cinzel/400.css";
import "@fontsource/cinzel/700.css";
import { App } from "./App";
import { fantasyOscarsTheme } from "./theme/theme";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={fantasyOscarsTheme} defaultColorScheme="dark">
      <App />
    </MantineProvider>
  </React.StrictMode>
);
