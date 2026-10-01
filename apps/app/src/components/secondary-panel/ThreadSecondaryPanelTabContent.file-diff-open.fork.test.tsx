// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import { WorkspaceFilePreviewTabContent } from "./ThreadSecondaryPanelTabContent";

function textPreview() {
  return {
    kind: "text",
    content: "const value = 1;",
    mimeType: "text/typescript",
    name: "app.ts",
    path: "src/app.ts",
    url: "/content/src/app.ts",
  };
}

function previewQuery() {
  return {
    data: textPreview(),
    error: null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  };
}

vi.mock("@/lib/sdk", () => ({
  sdk: {
    environments: {
      diffPatch: vi.fn(async () => ({ outcome: "available", patches: [] })),
    },
  },
}));

vi.mock("@/hooks/queries/environment-queries", () => ({
  useEnvironment: () => ({
    data: {
      isGitRepo: true,
      path: "/workspace",
      projectId: "proj_preview",
      startRef: "abc1234567890",
    },
    isError: false,
  }),
  useEnvironmentDiffFiles: vi.fn(),
  useEnvironmentFilePreview: () => previewQuery(),
  useEnvironmentWorkStatus: () => ({ data: undefined }),
}));

vi.mock("@/hooks/queries/project-queries", () => ({
  useProjectFilePreview: () => previewQuery(),
}));

vi.mock("@/hooks/queries/thread-queries", () => ({
  useThreadHostFilePreview: () => previewQuery(),
  useThreadStorageFilePreview: () => previewQuery(),
}));

vi.mock("@/hooks/queries/host-file-preview-query", () => ({
  useHostFilePreview: () => previewQuery(),
}));

vi.mock("@bb/shared-ui/icon-extended", () => ({}));

afterEach(cleanup);

const { wrapper } = createQueryClientTestHarness();

function renderPreview(
  diffIntent: {
    base?: "merge_base" | "thread_start";
    requestId: string;
    view: "unified" | "split";
  } | null,
) {
  return render(
    <WorkspaceFilePreviewTabContent
      activePath="src/app.ts"
      diffIntent={diffIntent}
      environmentId="env_preview"
      isPanelOpen
      lineRange={null}
      source={{ kind: "working-tree" }}
      statusLabel={null}
    />,
    { wrapper },
  );
}

describe("workspace file preview diff intent", () => {
  it("opens the file body when the request asked for no diff", () => {
    renderPreview(null);

    expect(screen.getByRole("button", { name: "Show changes" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Split" })).toBeNull();
  });

  it("opens the diff in the requested view", () => {
    renderPreview({ requestId: "req_1", view: "split" });

    expect(screen.getByRole("button", { name: "Hide changes" })).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Split" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("applies a repeat request for the same file", () => {
    const { rerender } = renderPreview({
      requestId: "req_1",
      view: "split",
    });
    expect(
      screen
        .getByRole("button", { name: "Split" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    rerender(
      <WorkspaceFilePreviewTabContent
        activePath="src/app.ts"
        diffIntent={{ requestId: "req_2", view: "unified" }}
        environmentId="env_preview"
        isPanelOpen
        lineRange={null}
        source={{ kind: "working-tree" }}
        statusLabel={null}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "Unified" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("compares since the thread start commit when the list asked for it", () => {
    renderPreview({
      base: "thread_start",
      requestId: "req_start",
      view: "split",
    });

    expect(
      screen.getByRole("button", { name: "Diff base" }).textContent,
    ).toContain("Changes since thread start");
  });
});
