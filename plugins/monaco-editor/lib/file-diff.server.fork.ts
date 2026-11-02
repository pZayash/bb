// bb-fork(file-diff): workspace Git diff of the open file, for the editor's diff mode.
import { z } from "zod";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
// bb-fork(file-diff-base): selection values shared with the editor UI.
import {
  ALL_SELECTION,
  COMMITTED_SELECTION,
  MERGE_BASE_SELECTION_SWITCH,
  THREAD_START_SELECTION,
  UNCOMMITTED_SELECTION,
} from "./file-diff-selection.fork.js";

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

const COMMIT_SHA_PATTERN = /^[0-9a-f]{4,40}$/iu;

const GIT_PLUGIN_ID = "bb--git";

// bb-fork(file-diff): the git plugin owns these reads now, so the editor parses
// bb-fork(file-diff): the fields it consumes from its RPC results.
const workspaceCommitSchema = z.object({
  sha: z.string(),
  shortSha: z.string(),
  subject: z.string(),
  authorName: z.string(),
  authoredAt: z.number(),
});
type WorkspaceCommit = z.infer<typeof workspaceCommitSchema>;

const workspaceStatusSchema = z.object({
  workingTree: z.object({ hasUncommittedChanges: z.boolean() }),
  mergeBase: z
    .object({
      baseRef: z.string().nullable(),
      commits: z.array(workspaceCommitSchema),
    })
    .nullable(),
});
type WorkspaceStatus = z.infer<typeof workspaceStatusSchema>;

const workspaceStatusResultSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("available"),
    workspace: workspaceStatusSchema,
  }),
  z.object({
    outcome: z.literal("not_applicable"),
    reason: z.string(),
    message: z.string(),
  }),
  z.object({
    outcome: z.literal("unavailable"),
    code: z.string(),
    message: z.string(),
  }),
]);

const diffFileSideQuerySchema = z.discriminatedUnion("target", [
  z.object({ target: z.literal("uncommitted"), path: z.string(), side: z.enum(["old", "new"]) }),
  z.object({
    target: z.enum(["branch_committed", "all"]),
    mergeBaseRef: z.string(),
    path: z.string(),
    side: z.enum(["old", "new"]),
  }),
  z.object({
    target: z.literal("commit"),
    sha: z.string(),
    path: z.string(),
    side: z.enum(["old", "new"]),
  }),
]);
type DiffFileTargetArgs = DistributiveOmit<
  z.infer<typeof diffFileSideQuerySchema>,
  "path" | "side"
>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

const fileSideResultSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("available"),
    file: z.object({
      content: z.string(),
      contentEncoding: z.enum(["base64", "utf8"]),
    }),
  }),
  z.object({
    outcome: z.literal("unavailable"),
    code: z.string(),
    message: z.string(),
  }),
]);

const filesResultSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("available"),
    truncated: z.boolean(),
    initialPatches: z.array(
      z.object({
        path: z.string(),
        patch: z.string(),
        truncated: z.boolean(),
      }),
    ),
  }),
  z.object({
    outcome: z.literal("not_applicable"),
    reason: z.string(),
    message: z.string(),
  }),
  z.object({
    outcome: z.literal("unavailable"),
    code: z.string(),
    message: z.string(),
  }),
]);

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
  const threadStartShort = threadStartRef?.slice(0, 7) ?? "";
  const changeOptions = isSinceThreadStart
    ? [
        {
          label: `Changes since thread start (${threadStartShort})`,
          value: ALL_SELECTION,
        },
        ...(commits.length > 0
          ? [
              {
                label: `Committed since thread start (${threadStartShort})`,
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

type GitDiffTarget =
  | { type: "uncommitted" }
  | { type: "branch_committed" | "all"; mergeBaseBranch: string }
  | { type: "commit"; sha: string };

function buildFileDiffTarget(
  selection: string,
  mergeBaseBranch: string | undefined,
): GitDiffTarget | null {
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
    const response = await plugin.sdk.plugins.callRpc({
      pluginId: GIT_PLUGIN_ID,
      method: "fileSide",
      input: { environmentId, query: { ...target, path, side } },
      outputSchema: fileSideResultSchema,
    });
    if (response.outcome !== "available") return null;
    return response.file.contentEncoding === "utf8"
      ? response.file.content
      : null;
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
  const statusResponse = await plugin.sdk.plugins.callRpc({
    pluginId: GIT_PLUGIN_ID,
    method: "workspaceStatus",
    input: {
      environmentId,
      ...(compareRef === undefined ? {} : { mergeBaseBranch: compareRef }),
    },
    outputSchema: workspaceStatusResultSchema,
  });
  if (statusResponse.outcome === "not_applicable") {
    return { outcome: "unavailable", message: statusResponse.message };
  }
  if (statusResponse.outcome === "unavailable") {
    return { outcome: "unavailable", message: statusResponse.message };
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

  const filesResponse = await plugin.sdk.plugins.callRpc({
    pluginId: GIT_PLUGIN_ID,
    method: "files",
    input: { environmentId, target, ignoreWhitespace: false },
    outputSchema: filesResultSchema,
  });
  if (filesResponse.outcome === "not_applicable") {
    return { outcome: "unavailable", message: filesResponse.message };
  }
  if (filesResponse.outcome === "unavailable") {
    return { outcome: "unavailable", message: filesResponse.message };
  }

  const entry =
    filesResponse.initialPatches.find((candidate) => candidate.path === path) ??
    filesResponse.initialPatches[0];
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
