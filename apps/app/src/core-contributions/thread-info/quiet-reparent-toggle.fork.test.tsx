// @vitest-environment jsdom
// bb-fork(quiet-reparent): the Info-tab Parent row keeps the quiet switch.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@bb/shared-ui/tooltip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuietReparentToggle } from "./quiet-reparent-toggle.fork";

afterEach(() => {
  cleanup();
});

describe("QuietReparentToggle", () => {
  it("reports the next checked state", () => {
    const onChange = vi.fn();
    render(
      <TooltipProvider>
        <QuietReparentToggle
          checked={false}
          disabled={false}
          onChange={onChange}
        />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByLabelText("Quiet reparent"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("shows the saved state and disables while pending", () => {
    render(
      <TooltipProvider>
        <QuietReparentToggle checked disabled onChange={vi.fn()} />
      </TooltipProvider>,
    );
    const toggle = screen.getByLabelText("Quiet reparent");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(toggle.hasAttribute("disabled")).toBe(true);
  });
});
