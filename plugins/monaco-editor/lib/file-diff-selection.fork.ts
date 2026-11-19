// bb-fork(file-diff-base): diff-base selection values shared by the editor UI and its RPC server.
export const ALL_SELECTION = "all";
export const THREAD_START_SELECTION = "thread_start_ref";
export const MERGE_BASE_SELECTION_SWITCH = "merge_base_ref";
export const COMMITTED_SELECTION = "branch_committed";
export const UNCOMMITTED_SELECTION = "uncommitted";

// bb-fork(file-diff-base): diff base can be any commit, not only the preset refs.
export const SINCE_COMMIT_PREFIX = "since_commit:";
export const SINCE_COMMITTED_PREFIX = "since_committed:";

export function parseSinceSelection(
  selection: string | null,
): { committed: boolean; sha: string } | null {
  if (selection === null) return null;
  const committed = selection.startsWith(SINCE_COMMITTED_PREFIX);
  const prefixed = selection.startsWith(SINCE_COMMIT_PREFIX) || committed;
  if (!prefixed) return null;
  const sha = selection.slice(
    committed ? SINCE_COMMITTED_PREFIX.length : SINCE_COMMIT_PREFIX.length,
  );
  return /^[0-9a-f]{4,40}$/iu.test(sha) ? { committed, sha } : null;
}
