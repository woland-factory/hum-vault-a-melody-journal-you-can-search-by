import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initSentry } from "./telemetry/sentry";
import { initAnalytics } from "./telemetry/analytics";
import "./styles/app.css";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

// Telemetry loads only when configured, and never blocks first paint.
void initSentry();
initAnalytics();
