// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useThreadStartCommitView } from "./thread-start-view.fork";

function Probe({ environmentId }: { environmentId: string }) {
  const [isActive, setActive] = useThreadStartCommitView(environmentId);
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={() => setActive(!isActive)}
    >
      {isActive ? "on" : "off"}
    </button>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(cleanup);

describe("thread start commit view", () => {
  it("remembers the chosen view per environment", () => {
    const { unmount } = render(<Probe environmentId="env_a" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button").textContent).toBe("on");
    unmount();

    render(<Probe environmentId="env_b" />);
    expect(screen.getByRole("button").textContent).toBe("off");
    cleanup();

    render(<Probe environmentId="env_a" />);
    expect(screen.getByRole("button").textContent).toBe("on");
  });

  it("treats a missing environment as inactive", () => {
    function MissingProbe() {
      const [isActive] = useThreadStartCommitView(null);
      return <span>{isActive ? "on" : "off"}</span>;
    }

    render(<MissingProbe />);

    expect(screen.getByText("off")).toBeTruthy();
  });
});
