// bb-fork(changed-files-filter): filter a changed-files list by path, like the Diff panel.
import { filterDiffFilesByPath } from "@/components/secondary-panel/git-diff/gitDiffPanelHelpers";
import type { WorkspaceChangedFile } from "@/components/thread/WorkspaceChangesList";

export const WORKSPACE_CHANGES_FILTER_PLACEHOLDER =
  "Filter files, e.g. *.md, docs/**, !*.test.ts";

export const WORKSPACE_CHANGES_FILTER_MIN_FILES = 8;

export function filterWorkspaceChangedFiles(
  files: readonly WorkspaceChangedFile[],
  query: string,
): readonly WorkspaceChangedFile[] {
  if (query.trim() === "" || files.length === 0) {
    return files;
  }
  const kept = new Set(
    filterDiffFilesByPath(
      files.map((file, index) => ({
        index,
        path: file.path,
        previousPath: null,
      })),
      query,
    ).map((entry) => entry.index),
  );
  return kept.size === files.length
    ? files
    : files.filter((_, index) => kept.has(index));
}
