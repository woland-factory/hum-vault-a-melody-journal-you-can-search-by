import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusMessage from "../src/components/StatusMessage";

// The tone drives how assistive tech announces the surface: an error interrupts
// (role="alert", assertive), an info/empty state waits its turn (role="status",
// polite). Proves AC5.2 at the component level.
describe("StatusMessage tone-to-role mapping", () => {
  it("announces an error assertively with role=alert", () => {
    render(<StatusMessage tone="error" title="Try again" body="Something to do" />);
    const surface = screen.getByRole("alert");
    expect(surface).toHaveTextContent("Try again");
    expect(surface).toHaveAttribute("aria-live", "assertive");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("announces an info state politely with role=status", () => {
    render(<StatusMessage title="All set" body="Nothing urgent" />);
    const surface = screen.getByRole("status");
    expect(surface).toHaveTextContent("All set");
    expect(surface).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the title an h2 so it nests under the screen h1", () => {
    render(<StatusMessage title="Heading" body="Body" />);
    expect(screen.getByRole("heading", { level: 2, name: "Heading" })).toBeInTheDocument();
  });
});
