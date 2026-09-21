import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmDialog from "../src/components/ConfirmDialog";

function setup(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      title="Delete this idea?"
      body="This cannot be undone."
      confirmLabel="Delete"
      cancelLabel="Keep"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmDialog accessibility (AC5.3)", () => {
  it("is a labelled modal dialog", () => {
    setup();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const labelledby = dialog.getAttribute("aria-labelledby");
    expect(labelledby).toBeTruthy();
    expect(document.getElementById(labelledby!)).toHaveTextContent("Delete this idea?");
  });

  it("moves focus into the dialog on open, onto the least destructive action", () => {
    setup();
    expect(screen.getByRole("button", { name: "Keep" })).toHaveFocus();
  });

  it("traps Tab focus between the two actions", async () => {
    const user = userEvent.setup();
    setup();
    const keep = screen.getByRole("button", { name: "Keep" });
    const del = screen.getByRole("button", { name: "Delete" });

    expect(keep).toHaveFocus();
    await user.tab();
    expect(del).toHaveFocus();
    // Forward past the last action wraps to the first.
    await user.tab();
    expect(keep).toHaveFocus();
    // Shift+Tab from the first wraps to the last.
    await user.tab({ shift: true });
    expect(del).toHaveFocus();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const { onCancel } = setup();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables both actions the moment confirm is tapped (immediate feedback)", async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    const del = screen.getByRole("button", { name: "Delete" });
    await user.click(del);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    // Pending in place: cannot fire twice, and cancel is locked out too.
    expect(del).toBeDisabled();
    expect(del).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Keep" })).toBeDisabled();
  });
});

describe("ConfirmDialog focus restore", () => {
  it("returns focus to the trigger that opened it, on close", async () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>
            open
          </button>
          {open && (
            <ConfirmDialog
              title="Delete this idea?"
              body="b"
              confirmLabel="Delete"
              cancelLabel="Keep"
              onConfirm={() => setOpen(false)}
              onCancel={() => setOpen(false)}
            />
          )}
        </>
      );
    }
    const user = userEvent.setup();
    render(<Host />);
    const trigger = screen.getByTestId("trigger");

    // Opening via the trigger means the trigger is the previously-focused
    // element the dialog should restore to.
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Keep" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
