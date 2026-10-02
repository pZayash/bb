// bb-fork(thread-start-ref): one section for everything changed since the thread's start commit.
import type { WorkspaceStatus } from "@bb/domain";
import type { WorkspaceChangedFilesSection } from "./workspace-change-summary";

export const THREAD_START_CHANGES_LABEL = "Since thread start";

// bb-fork(thread-start-ref): name the anchor commit beside the label.
export function threadStartChangesLabel(startRef: string | null): string {
  return startRef === null
    ? THREAD_START_CHANGES_LABEL
    : `${THREAD_START_CHANGES_LABEL} (${startRef.slice(0, 7)})`;
}

// bb-fork(thread-start-ref): the changed-files card stays reachable with no changes.
export function emptyThreadStartChangedFilesSection(
  isSinceThreadStart: boolean,
  startRef: string | null,
): WorkspaceChangedFilesSection {
  return {
    files: [],
    kind: "committed",
    label: isSinceThreadStart
      ? threadStartChangesLabel(startRef)
      : "All changes",
    mergeBaseRef: null,
    stats: { deletions: 0, files: [], insertions: 0, lineStatsComplete: true },
  };
}

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
    label: threadStartChangesLabel(mergeBase?.baseRef ?? null),
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
