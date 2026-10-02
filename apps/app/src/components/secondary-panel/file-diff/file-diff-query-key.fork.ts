// bb-fork(file-diff): file-tab diff response key, separate from the upstream environment patch-entry cache that stores bare DiffPatchEntry objects at the same coordinates.
const FILE_DIFF_PATCH_QUERY_KEY = "fileDiffPatchTab";

export type FileDiffPatchQueryKey = readonly [
  typeof FILE_DIFF_PATCH_QUERY_KEY,
  string,
  string | null,
  string | null,
  string,
];

export function fileDiffPatchQueryKey(
  environmentId: string,
  targetType: string | null,
  targetKey: string | null,
  path: string,
): FileDiffPatchQueryKey {
  return [
    FILE_DIFF_PATCH_QUERY_KEY,
    environmentId,
    targetType,
    targetKey,
    path,
  ];
}
