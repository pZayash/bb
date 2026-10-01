// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeEnvironment } from "@bb/test-helpers/domain-fixtures";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import { useFileDiff } from "./useFileDiff.fork";

const environmentQueries = vi.hoisted(() => ({
  statusRefs: [] as (string | undefined)[],
}));

const sdkCalls = vi.hoisted(() => ({
  diffPatchTargets: [] as unknown[],
}));

vi.mock("@/hooks/queries/environment-queries", () => ({
  useEnvironment: () => ({
    data: makeEnvironment({ startRef: "abc1234567890" }),
    isError: false,
  }),
  useEnvironmentWorkStatus: (
    _environmentId: string,
    mergeBaseBranch?: string,
  ) => {
    environmentQueries.statusRefs.push(mergeBaseBranch);
    const isSinceStart = mergeBaseBranch === "abc1234567890";
    return {
      data: {
        outcome: "available",
        workspace: {
          mergeBase: {
            baseRef: mergeBaseBranch ?? null,
            commits: isSinceStart
              ? [
                  {
                    sha: "def4567890123",
                    shortSha: "def4567",
                    subject: "agent commit",
                  },
                ]
              : [],
          },
          workingTree: { hasUncommittedChanges: false },
        },
      },
    };
  },
}));

vi.mock("@/lib/sdk", () => ({
  sdk: {
    environments: {
      diffPatch: async (args: { target: unknown }) => {
        sdkCalls.diffPatchTargets.push(args.target);
        return {
          outcome: "available",
          patches: [
            {
              path: "src/file.ts",
              patch: "diff --git a/src/file.ts b/src/file.ts\n",
              truncated: false,
            },
          ],
        };
      },
      diffFile: async () => {
        throw new Error("no contents in this test");
      },
    },
  },
}));

const { wrapper } = createQueryClientTestHarness();

function Probe({
  intentKey,
  sinceThreadStartIntent = false,
  path,
}: {
  intentKey?: string | null;
  sinceThreadStartIntent?: boolean;
  path?: string;
}) {
  const controller = useFileDiff({
    enabled: true,
    environmentId: "env_1",
    intentKey,
    path: path ?? "src/file.ts",
    sinceThreadStartIntent,
  });
  return (
    <div>
      <span data-testid="selection">{controller.selectionValue}</span>
      <ul data-testid="options">
        {controller.options.map((option) => (
          <li key={option.value} data-value={option.value}>
            {option.label}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => controller.onSelectionChange("thread_start_ref")}
      >
        since start
      </button>
      <button
        type="button"
        onClick={() => controller.onSelectionChange("merge_base_ref")}
      >
        since merge base
      </button>
    </div>
  );
}

function optionValues(): string[] {
  return Array.from(screen.getByTestId("options").querySelectorAll("li")).map(
    (item) => item.getAttribute("data-value") ?? "",
  );
}

function optionLabels(): string[] {
  return Array.from(screen.getByTestId("options").querySelectorAll("li")).map(
    (item) => item.textContent ?? "",
  );
}

beforeEach(() => {
  environmentQueries.statusRefs.length = 0;
  sdkCalls.diffPatchTargets.length = 0;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useFileDiff comparison ref", () => {
  it("offers the thread start commit next to the merge-base changes", async () => {
    render(<Probe />, { wrapper });

    await screen.findByText(/Since thread start \(abc1234\)/);
    expect(optionValues()).toContain("thread_start_ref");
  });

  it("starts on the thread start commit when the open request asked for it", async () => {
    render(<Probe path="src/other.ts" sinceThreadStartIntent />, { wrapper });

    await screen.findByText(/Changes since thread start/);
    expect(environmentQueries.statusRefs).toContain("abc1234567890");
    expect(screen.getByTestId("selection").textContent).toBe("all");
    expect(sdkCalls.diffPatchTargets.at(-1)).toEqual({
      mergeBaseBranch: "abc1234567890",
      type: "all",
    });
  });

  it("diffs everything since the thread start commit once picked", async () => {
    render(<Probe />, { wrapper });
    await screen.findByText(/Since thread start/);

    act(() => {
      screen.getByRole("button", { name: "since start" }).click();
    });

    expect(environmentQueries.statusRefs).toContain("abc1234567890");
    expect(optionLabels()).toContain("Changes since thread start");
    expect(optionLabels()).toContain("agent commit");
    expect(screen.getByTestId("selection").textContent).toBe("all");
    expect(sdkCalls.diffPatchTargets.at(-1)).toEqual({
      mergeBaseBranch: "abc1234567890",
      type: "all",
    });
  });

  it("re-applies a new open request's base after the user picked one", async () => {
    const { rerender } = render(<Probe intentKey="req_1" />, { wrapper });
    await screen.findByText(/Since thread start/);
    act(() => {
      screen.getByRole("button", { name: "since start" }).click();
    });
    expect(environmentQueries.statusRefs.at(-1)).toBe("abc1234567890");

    rerender(<Probe intentKey="req_2" />);

    await waitFor(() =>
      expect(environmentQueries.statusRefs.at(-1)).toBe("main"),
    );
  });

  it("returns to the merge base when asked", async () => {
    render(<Probe />, { wrapper });
    await screen.findByText(/Since thread start/);
    act(() => {
      screen.getByRole("button", { name: "since start" }).click();
    });

    act(() => {
      screen.getByRole("button", { name: "since merge base" }).click();
    });

    expect(optionLabels()).toContain("All changes");
    expect(environmentQueries.statusRefs.at(-1)).toBe("main");
  });
});
