import { describe, expect, it } from "vitest";
import { makeEnvironment } from "@bb/test-helpers/domain-fixtures";
import type { WorkspaceStatus } from "@bb/domain";
import {
  buildThreadStartChangedFilesSection,
  emptyThreadStartChangedFilesSection,
  THREAD_START_CHANGES_LABEL,
} from "./thread-start-changes.fork";

const file = (path: string) => ({
  path,
  status: "M" as const,
  staged: false,
  insertions: 1,
  deletions: 0,
  binary: false,
  origin: "tracked" as const,
});

function status(overrides: Partial<WorkspaceStatus>): WorkspaceStatus {
  const environment = makeEnvironment();
  return {
    branch: { currentBranch: environment.branchName, defaultBranch: "main" },
    checkout: { headSha: "abc1234567890", kind: "branch", branchName: "main" },
    mergeBase: null,
    workingTree: {
      files: [],
      hasUncommittedChanges: false,
      insertions: 0,
      deletions: 0,
      lineStatsComplete: true,
      state: "clean",
    },
    ...overrides,
  } as WorkspaceStatus;
}

describe("buildThreadStartChangedFilesSection", () => {
  it("merges committed-since-start files with uncommitted ones", () => {
    const section = buildThreadStartChangedFilesSection(
      status({
        mergeBase: {
          baseRef: "abc1234567890",
          commits: [],
          files: [file("src/committed.ts")],
          insertions: 5,
          deletions: 1,
          lineStatsComplete: true,
          aheadCount: 1,
          behindCount: 0,
          hasCommittedUnmergedChanges: false,
          mergeBaseBranch: "main",
        },
        workingTree: {
          files: [file("src/pending.ts")],
          hasUncommittedChanges: true,
          insertions: 2,
          deletions: 0,
          lineStatsComplete: true,
          state: "dirty_uncommitted",
        },
      }),
    );

    expect(section?.label).toBe(THREAD_START_CHANGES_LABEL);
    expect(section?.mergeBaseRef).toBe("abc1234567890");
    expect(section?.files.map((entry) => entry.path)).toEqual([
      "src/committed.ts",
      "src/pending.ts",
    ]);
    expect(section?.stats).toMatchObject({
      insertions: 7,
      deletions: 1,
      lineStatsComplete: true,
    });
  });

  it("reports nothing when the workspace matches the start commit", () => {
    expect(buildThreadStartChangedFilesSection(status({}))).toBeNull();
    expect(buildThreadStartChangedFilesSection(undefined)).toBeNull();
  });

  it("keeps an empty start-commit section under the view's label", () => {
    expect(emptyThreadStartChangedFilesSection(true)).toMatchObject({
      label: THREAD_START_CHANGES_LABEL,
      files: [],
      mergeBaseRef: null,
      stats: { insertions: 0, deletions: 0, files: [] },
    });
    expect(emptyThreadStartChangedFilesSection(false).label).toBe(
      "All changes",
    );
  });
});
