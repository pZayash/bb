// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseGitDiffFiles } from "@/components/git-diff/git-diff-parsing";
import { GIT_DIFF_DISPLAY_MODE_STORAGE_KEY } from "@/lib/git-diff-view-preferences";
import { FileDiffView } from "./FileDiffView.fork";
import type { FileDiffController } from "./useFileDiff.fork";

const bbDiff = vi.hoisted(() => ({
  lastProps: null as Record<string, unknown> | null,
}));

vi.mock("@/components/code/BbDiff", async () => {
  const React = await import("react");
  return {
    default: (props: Record<string, unknown>) => {
      bbDiff.lastProps = props;
      return React.createElement("div", {
        "data-testid": "bb-diff",
        "data-view": String(props.view),
        "data-overflow": String(props.overflow),
        "data-expand-unchanged": String(props.expandUnchanged),
      });
    },
  };
});

const PATCH = [
  "diff --git a/src/app.ts b/src/app.ts",
  "--- a/src/app.ts",
  "+++ b/src/app.ts",
  "@@ -1,3 +1,3 @@",
  " const a = 1;",
  "-const b = 2;",
  "+const b = 3;",
  " const c = 4;",
  "",
].join("\n");

const intersectionCallbacks = new Set<IntersectionObserverCallback>();

function revealDiffBodies() {
  act(() => {
    for (const callback of intersectionCallbacks) {
      callback(
        [
          {
            isIntersecting: true,
            intersectionRatio: 1,
          } as IntersectionObserverEntry,
        ],
        { thresholds: [0] } as unknown as IntersectionObserver,
      );
    }
  });
}

function fixture() {
  const file = parseGitDiffFiles(PATCH)[0];
  if (file === undefined) throw new Error("fixture patch did not parse");
  return file;
}

function controller(
  overrides: Partial<FileDiffController> = {},
): FileDiffController {
  return {
    availability: { status: "available" },
    bodyState: {
      status: "ready",
      fileDiff: fixture(),
      patchText: PATCH,
      truncated: false,
    },
    onRequestFileContents: undefined,
    onSelectionChange: () => {},
    options: [
      { label: "All changes", value: "all" },
      { label: "Uncommitted changes", value: "uncommitted" },
    ],
    selectionValue: "all",
    ...overrides,
  };
}

beforeEach(() => {
  bbDiff.lastProps = null;
  intersectionCallbacks.clear();
  window.localStorage.clear();
  vi.stubGlobal(
    "IntersectionObserver",
    class IntersectionObserverMock {
      readonly thresholds = [0];
      constructor(private readonly callback: IntersectionObserverCallback) {
        intersectionCallbacks.add(this.callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {
        intersectionCallbacks.delete(this.callback);
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("FileDiffView", () => {
  it("renders the stored split preference and the chosen base in the selector", async () => {
    window.localStorage.setItem(GIT_DIFF_DISPLAY_MODE_STORAGE_KEY, "split");
    render(<FileDiffView controller={controller()} />);
    revealDiffBodies();

    const diff = await screen.findByTestId("bb-diff");
    expect(diff.getAttribute("data-view")).toBe("split");
    expect(
      screen.getByRole("button", { name: "Diff base" }).textContent,
    ).toContain("All changes");
  });

  it("asks the renderer for both complete sides", async () => {
    render(<FileDiffView controller={controller()} />);
    revealDiffBodies();

    const diff = await screen.findByTestId("bb-diff");
    expect(diff.getAttribute("data-expand-unchanged")).toBe("true");
  });

  it("switches the renderer to the unified style on demand", async () => {
    window.localStorage.setItem(GIT_DIFF_DISPLAY_MODE_STORAGE_KEY, "split");
    render(<FileDiffView controller={controller()} />);
    revealDiffBodies();
    await screen.findByTestId("bb-diff");

    fireEvent.click(screen.getByRole("button", { name: "Unified" }));

    expect(bbDiff.lastProps?.view).toBe("unified");
    expect(bbDiff.lastProps?.overflow).toBe("scroll");
  });

  it("reports the chosen base to the controller", async () => {
    const onSelectionChange = vi.fn();
    render(<FileDiffView controller={controller({ onSelectionChange })} />);
    revealDiffBodies();
    await screen.findByTestId("bb-diff");

    fireEvent.pointerDown(screen.getByRole("button", { name: "Diff base" }), {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /Uncommitted changes/ }),
    );

    expect(onSelectionChange).toHaveBeenCalledWith("uncommitted");
  });

  it("flags a truncated patch", async () => {
    render(
      <FileDiffView
        controller={controller({
          bodyState: {
            status: "ready",
            fileDiff: fixture(),
            patchText: PATCH,
            truncated: true,
          },
        })}
      />,
    );
    revealDiffBodies();

    await screen.findByTestId("bb-diff");
    expect(
      screen.getByText("This diff was truncated for display."),
    ).not.toBeNull();
  });

  it("explains an unavailable diff instead of rendering a body", async () => {
    render(
      <FileDiffView
        controller={controller({
          bodyState: {
            status: "unavailable",
            message: "This workspace is not a Git repository.",
          },
        })}
      />,
    );

    expect(
      await screen.findByText("This workspace is not a Git repository."),
    ).not.toBeNull();
    expect(screen.queryByTestId("bb-diff")).toBeNull();
  });
});
