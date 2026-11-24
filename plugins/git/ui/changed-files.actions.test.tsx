// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { WorkspaceChangedFilesSection } from "./workspace-change-summary.js";
import { useChangedFileActions } from "./changed-files.js";
import type {
  WorkspaceFileStatus,
  WorkspaceFileStatusKind,
} from "../contract.js";

function file(
  status: WorkspaceFileStatusKind,
  path = "src/file.ts",
): WorkspaceFileStatus {
  return { path, status, insertions: null, deletions: null };
}

function section(
  overrides: Partial<WorkspaceChangedFilesSection<WorkspaceFileStatus>> = {},
): WorkspaceChangedFilesSection<WorkspaceFileStatus> {
  const changed = file("M");
  return {
    kind: "uncommitted",
    label: "Uncommitted files",
    files: [changed],
    mergeBaseRef: null,
    stats: {
      files: [changed],
      insertions: 1,
      deletions: 1,
      lineStatsComplete: true,
      fileCount: 1,
    },
    ...overrides,
  };
}

function Probe() {
  const actions = useChangedFileActions("env-1");
  return (
    <>
      <button
        type="button"
        onClick={() =>
          actions.onChangedFileDiffClick({
            file: file("M"),
            section: section(),
          })
        }
      >
        DiffModified
      </button>
      <button
        type="button"
        onClick={() =>
          actions.onChangedFileDiffClick({
            file: file("D", "src/deleted.ts"),
            section: section(),
          })
        }
      >
        DiffDeleted
      </button>
      <button
        type="button"
        onClick={() =>
          actions.onChangedFileDiffClick({
            file: file("A", "src/added.ts"),
            section: section(),
          })
        }
      >
        DiffAdded
      </button>
    </>
  );
}

function previewCalls(rendered: ReturnType<typeof renderSlot>) {
  return rendered.navigateCalls.filter(
    (call) => call.method === "experimental_openFilePreview",
  );
}

afterEach(cleanup);

describe("useChangedFileActions diff-open action", () => {
  it("requests a split diff intent for a modified file", () => {
    const rendered = renderSlot({ component: Probe }, {}, { pluginId: "bb--git" });
    fireEvent.click(screen.getByRole("button", { name: "DiffModified" }));

    const calls = previewCalls(rendered);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.options).toMatchObject({
      target: { kind: "workspace", environmentId: "env-1", path: "src/file.ts" },
      location: null,
      experimental_diffIntent: { view: "split" },
    });
    const intent = (
      calls[0]!.options as { experimental_diffIntent: { requestId: string } }
    ).experimental_diffIntent;
    expect(intent.requestId.length).toBeGreaterThan(0);
  });

  it("mints a fresh requestId on every call", () => {
    const rendered = renderSlot({ component: Probe }, {}, { pluginId: "bb--git" });
    const button = screen.getByRole("button", { name: "DiffModified" });
    fireEvent.click(button);
    fireEvent.click(button);

    const ids = previewCalls(rendered).map(
      (call) =>
        (
          call.options as {
            experimental_diffIntent: { requestId: string };
          }
        ).experimental_diffIntent.requestId,
    );
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("opens a deleted file's ref preview without a diff intent", () => {
    const rendered = renderSlot({ component: Probe }, {}, { pluginId: "bb--git" });
    fireEvent.click(screen.getByRole("button", { name: "DiffDeleted" }));

    const calls = previewCalls(rendered);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.options).toEqual({
      target: {
        kind: "workspace",
        environmentId: "env-1",
        path: "src/deleted.ts",
        experimental_ref: "HEAD",
      },
      location: null,
    });
  });

  it("opens an added file's working-tree preview without a diff intent", () => {
    const rendered = renderSlot({ component: Probe }, {}, { pluginId: "bb--git" });
    fireEvent.click(screen.getByRole("button", { name: "DiffAdded" }));

    const calls = previewCalls(rendered);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.options).toEqual({
      target: {
        kind: "workspace",
        environmentId: "env-1",
        path: "src/added.ts",
      },
      location: null,
    });
  });
});
