import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strings, fill } from "../src/copy/strings";
import {
  OnboardingProvider,
  useOnboarding,
} from "../src/onboarding/OnboardingContext";
import Walkthrough from "../src/components/Walkthrough";
import { getMeta, setMeta, FIRST_RUN_COMPLETE } from "../src/db/meta";
import { openDb } from "../src/db/entries";
import { META_STORE } from "../src/db/schema";

// Buttons that drive the onboarding actions so a test can walk the guide.
function Actions() {
  const { markDraftReady, markSaved, markSearched } = useOnboarding();
  return (
    <div>
      <button onClick={markDraftReady}>draft</button>
      <button onClick={markSaved}>save</button>
      <button onClick={markSearched}>search</button>
    </div>
  );
}

function Harness() {
  return (
    <OnboardingProvider>
      <Walkthrough />
      <Actions />
    </OnboardingProvider>
  );
}

async function clearMeta() {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

beforeEach(clearMeta);

describe("guided first run", () => {
  it("walks record, save, then search and completes on the first save-and-search", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    // Step 1 shows once the mount read of the flag resolves.
    expect(await screen.findByText(strings.onboarding.step1)).toBeInTheDocument();
    expect(
      screen.getByText(fill(strings.onboarding.progress, { n: 1 })),
    ).toBeInTheDocument();

    // A ready draft advances to step 2.
    await user.click(screen.getByText("draft"));
    expect(await screen.findByText(strings.onboarding.step2)).toBeInTheDocument();

    // Saving advances to step 3.
    await user.click(screen.getByText("save"));
    expect(await screen.findByText(strings.onboarding.step3)).toBeInTheDocument();

    // A search after a save ends the guide and records completion.
    await user.click(screen.getByText("search"));
    await waitFor(() =>
      expect(screen.queryByTestId("walkthrough")).not.toBeInTheDocument(),
    );
    expect(await getMeta<boolean>(FIRST_RUN_COMPLETE)).toBe(true);
  });

  it("announces step changes through a live region (AC5.5)", async () => {
    render(<Harness />);
    const chip = await screen.findByTestId("walkthrough");
    // A polite live region so a screen reader reads each step as it changes.
    expect(chip).toHaveAttribute("aria-live", "polite");
  });

  it("skips at any step and records completion", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await screen.findByTestId("walkthrough");
    await user.click(screen.getByRole("button", { name: strings.onboarding.skip }));

    await waitFor(() =>
      expect(screen.queryByTestId("walkthrough")).not.toBeInTheDocument(),
    );
    expect(await getMeta<boolean>(FIRST_RUN_COMPLETE)).toBe(true);
  });

  it("never shows again once first run is complete", async () => {
    await setMeta(FIRST_RUN_COMPLETE, true);
    render(<Harness />);

    // The mount read resolves to the set flag; the guide stays hidden.
    await waitFor(async () =>
      expect(await getMeta<boolean>(FIRST_RUN_COMPLETE)).toBe(true),
    );
    expect(screen.queryByTestId("walkthrough")).not.toBeInTheDocument();
  });
});
