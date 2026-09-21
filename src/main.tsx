import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { OnboardingProvider } from "./onboarding/OnboardingContext";
import { seedDemoIfEnabled } from "./demo/seedDemo";
import { initSentry } from "./telemetry/sentry";
import { initAnalytics } from "./telemetry/analytics";
import "./styles/app.css";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <OnboardingProvider>
        <App />
      </OnboardingProvider>
    </React.StrictMode>,
  );
}

// Telemetry loads only when configured, and never blocks first paint.
void initSentry();
initAnalytics();

// Seed the demo songbook after first paint when SEED_DEMO is on. Fire-and-
// forget: it never blocks the shell and no-ops unless the flag is set.
void seedDemoIfEnabled();
