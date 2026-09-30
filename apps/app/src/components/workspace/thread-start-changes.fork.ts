// bb-fork(thread-start-ref): one section for everything changed since the thread's start commit.
import type { WorkspaceStatus } from "@bb/domain";
import type { WorkspaceChangedFilesSection } from "./workspace-change-summary";

export const THREAD_START_CHANGES_LABEL = "Since thread start";

export function buildThreadStartChangedFilesSection(
  workspaceStatus: WorkspaceStatus | undefined,
): WorkspaceChangedFilesSection | null {
  if (!workspaceStatus) return null;
  const { mergeBase, workingTree } = workspaceStatus;
  const files = [...(mergeBase?.files ?? []), ...workingTree.files];
  if (files.length === 0) return null;

  return {
    files,
    kind: "committed",
    label: THREAD_START_CHANGES_LABEL,
    mergeBaseRef: mergeBase?.baseRef ?? null,
    stats: {
      deletions: (mergeBase?.deletions ?? 0) + workingTree.deletions,
      files,
      insertions: (mergeBase?.insertions ?? 0) + workingTree.insertions,
      lineStatsComplete:
        (mergeBase?.lineStatsComplete ?? true) && workingTree.lineStatsComplete,
    },
  };
}
