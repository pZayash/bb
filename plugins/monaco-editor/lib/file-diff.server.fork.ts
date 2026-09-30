// bb-fork(file-diff): workspace Git diff of the open file, for the editor's diff mode.
import { z } from "zod";
import type { BbPluginApi } from "@get-bb/plugin-sdk";

export const fileDiffSelectionSchema = z.string().min(1).nullable();

export const fileDiffOptionSchema = z.object({
  label: z.string(),
  monoPrefix: z.string().optional(),
  value: z.string(),
});

export const fileDiffContentsSchema = z.object({
  new: z.string(),
  old: z.string(),
});

export const fileDiffResultSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("available"),
    contents: fileDiffContentsSchema.nullable(),
    options: z.array(fileDiffOptionSchema),
    patch: z.string(),
    selection: z.string(),
    truncated: z.boolean(),
  }),
  z.object({ outcome: z.literal("unavailable"), message: z.string() }),
]);

export type FileDiffContents = z.infer<typeof fileDiffContentsSchema>;
export type FileDiffOption = z.infer<typeof fileDiffOptionSchema>;
export type FileDiffResult = z.infer<typeof fileDiffResultSchema>;

const ALL_SELECTION = "all";
// bb-fork(thread-start-ref): picker entries that switch the comparison ref.
const THREAD_START_SELECTION = "thread_start_ref";
const MERGE_BASE_SELECTION_SWITCH = "merge_base_ref";
const COMMITTED_SELECTION = "branch_committed";
const UNCOMMITTED_SELECTION = "uncommitted";
const COMMIT_SHA_PATTERN = /^[0-9a-f]{4,40}$/iu;

type EnvironmentsSdk = BbPluginApi["sdk"]["environments"];
type WorkspaceStatus = Extract<
  Awaited<ReturnType<EnvironmentsSdk["status"]>>,
  { outcome: "available" }
>["workspace"];
type WorkspaceCommit = NonNullable<
  WorkspaceStatus["mergeBase"]
>["commits"][number];
type DiffFileTargetArgs = DistributiveOmit<
  Parameters<EnvironmentsSdk["diffFile"]>[0],
  "environmentId" | "path" | "side" | "signal"
>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

interface BuildFileDiffOptionsArgs {
  commits: readonly WorkspaceCommit[];
  hasMergeBase: boolean;
  hasUncommittedChanges: boolean;
  isSinceThreadStart: boolean;
  mergeBaseBranch: string | undefined;
  threadStartRef: string | null;
}

function buildFileDiffOptions({
  commits,
  hasMergeBase,
  hasUncommittedChanges,
  isSinceThreadStart,
  mergeBaseBranch,
  threadStartRef,
}: BuildFileDiffOptionsArgs): FileDiffOption[] {
  const changeOptions = isSinceThreadStart
    ? [
        {
          label: "Changes since thread start",
          value: ALL_SELECTION,
        },
        ...(commits.length > 0
          ? [
              {
                label: "Committed since thread start",
                value: COMMITTED_SELECTION,
              },
            ]
          : []),
      ]
    : !hasMergeBase
      ? [{ label: "Uncommitted changes", value: UNCOMMITTED_SELECTION }]
      : [
          { label: "All changes", value: ALL_SELECTION },
          ...(commits.length > 0
            ? [{ label: "Committed changes", value: COMMITTED_SELECTION }]
            : []),
        ];
  const uncommittedOptions =
    hasUncommittedChanges && hasMergeBase
      ? [{ label: "Uncommitted changes", value: UNCOMMITTED_SELECTION }]
      : [];
  const commitOptions = commits.map((commit) => ({
    label: commit.subject,
    monoPrefix: commit.shortSha,
    value: commit.sha,
  }));
  if (threadStartRef === null) {
    return [...changeOptions, ...uncommittedOptions, ...commitOptions];
  }
  const switchOption: FileDiffOption = isSinceThreadStart
    ? {
        label: mergeBaseBranch
          ? `Compare with merge base (${mergeBaseBranch})`
          : "Compare with merge base",
        value: MERGE_BASE_SELECTION_SWITCH,
      }
    : {
        label: `Since thread start (${threadStartRef.slice(0, 7)})`,
        value: THREAD_START_SELECTION,
      };
  return [
    ...changeOptions,
    ...uncommittedOptions,
    ...commitOptions,
    switchOption,
  ];
}

function buildFileDiffTarget(
  selection: string,
  mergeBaseBranch: string | undefined,
): Parameters<EnvironmentsSdk["diffPatch"]>[0]["target"] | null {
  if (selection === UNCOMMITTED_SELECTION || mergeBaseBranch === undefined) {
    return { type: "uncommitted" };
  }
  if (selection === ALL_SELECTION || selection === THREAD_START_SELECTION) {
    return { mergeBaseBranch, type: "all" };
  }
  if (selection === COMMITTED_SELECTION) {
    return { mergeBaseBranch, type: "branch_committed" };
  }
  return COMMIT_SHA_PATTERN.test(selection)
    ? { sha: selection, type: "commit" }
    : null;
}

function buildDiffFileTargetArgs(
  selection: string,
  mergeBaseBranch: string | undefined,
  mergeBaseRef: string | null,
): DiffFileTargetArgs | null {
  if (selection === UNCOMMITTED_SELECTION || mergeBaseBranch === undefined) {
    return { target: "uncommitted" };
  }
  if (selection === ALL_SELECTION || selection === THREAD_START_SELECTION) {
    return mergeBaseRef === null ? null : { mergeBaseRef, target: "all" };
  }
  if (selection === COMMITTED_SELECTION) {
    return mergeBaseRef === null
      ? null
      : { mergeBaseRef, target: "branch_committed" };
  }
  return COMMIT_SHA_PATTERN.test(selection)
    ? { sha: selection, target: "commit" }
    : null;
}

async function readTextSide(
  plugin: BbPluginApi,
  environmentId: string,
  path: string,
  target: DiffFileTargetArgs,
  side: "new" | "old",
): Promise<string | null> {
  try {
    const response = await plugin.sdk.environments.diffFile({
      ...target,
      environmentId,
      path,
      side,
    });
    return response.contentEncoding === "utf8" ? response.content : null;
  } catch {
    return null;
  }
}

async function readFileDiffContents(
  plugin: BbPluginApi,
  environmentId: string,
  path: string,
  target: DiffFileTargetArgs | null,
): Promise<FileDiffContents | null> {
  if (target === null) return null;
  const [oldContent, newContent] = await Promise.all([
    readTextSide(plugin, environmentId, path, target, "old"),
    readTextSide(plugin, environmentId, path, target, "new"),
  ]);
  return oldContent === null || newContent === null
    ? null
    : { new: newContent, old: oldContent };
}

interface ResolveFileDiffArgs {
  environmentId: string | null;
  path: string;
  plugin: BbPluginApi;
  selection: string | null;
}

export async function resolveFileDiff({
  environmentId,
  path,
  plugin,
  selection,
}: ResolveFileDiffArgs): Promise<FileDiffResult> {
  if (environmentId === null) {
    return {
      outcome: "unavailable",
      message: "This file is not in a Git workspace.",
    };
  }

  const environment = await plugin.sdk.environments.get({ environmentId });
  if (!environment.isGitRepo) {
    return {
      outcome: "unavailable",
      message: "This workspace is not a Git repository.",
    };
  }

  const mergeBaseBranch =
    environment.mergeBaseBranch ??
    environment.baseBranch ??
    environment.defaultBranch ??
    undefined;
  // bb-fork(thread-start-ref): a workspace provisioned before this field reports none.
  const threadStartRef = environment.startRef ?? null;
  const isSinceThreadStart =
    selection === THREAD_START_SELECTION && threadStartRef !== null;
  const compareRef = isSinceThreadStart ? threadStartRef : mergeBaseBranch;
  const statusResponse = await plugin.sdk.environments.status({
    environmentId,
    ...(compareRef === undefined ? {} : { mergeBaseBranch: compareRef }),
  });
  if (statusResponse.outcome === "not_applicable") {
    return { outcome: "unavailable", message: statusResponse.message };
  }
  if (statusResponse.outcome === "unavailable") {
    return { outcome: "unavailable", message: statusResponse.failure.message };
  }

  const status = statusResponse.workspace;
  const commitOptions = status.mergeBase?.commits ?? [];
  const options = buildFileDiffOptions({
    commits: commitOptions,
    hasMergeBase: compareRef !== undefined,
    hasUncommittedChanges: status.workingTree.hasUncommittedChanges,
    isSinceThreadStart,
    mergeBaseBranch,
    threadStartRef,
  });
  const resolvedSelection = isSinceThreadStart
    ? THREAD_START_SELECTION
    : selection !== null && options.some((option) => option.value === selection)
      ? selection
      : options[0]!.value;
  const target = buildFileDiffTarget(
    resolvedSelection,
    isSinceThreadStart ? (threadStartRef ?? undefined) : mergeBaseBranch,
  );
  if (target === null) {
    return { outcome: "unavailable", message: "No changes to compare." };
  }

  const patchResponse = await plugin.sdk.environments.diffPatch({
    environmentId,
    paths: [path],
    target,
  });
  if (patchResponse.outcome === "not_applicable") {
    return { outcome: "unavailable", message: patchResponse.message };
  }
  if (patchResponse.outcome === "unavailable") {
    return { outcome: "unavailable", message: patchResponse.failure.message };
  }

  const entry =
    patchResponse.patches.find((candidate) => candidate.path === path) ??
    patchResponse.patches[0];
  if (entry === undefined) {
    return {
      outcome: "unavailable",
      message: "No changes to show for this file.",
    };
  }

  const contents = await readFileDiffContents(
    plugin,
    environmentId,
    path,
    buildDiffFileTargetArgs(
      resolvedSelection,
      mergeBaseBranch,
      status.mergeBase?.baseRef ?? null,
    ),
  );

  return {
    outcome: "available",
    contents,
    options,
    patch: entry.patch,
    selection: resolvedSelection,
    truncated: entry.truncated,
  };
}
