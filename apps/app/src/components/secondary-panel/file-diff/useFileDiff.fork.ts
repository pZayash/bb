// bb-fork(file-diff): diff data for one workspace file shown in a file tab.
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  resolveEnvironmentMergeBaseBranch,
  type WorkspaceCommitSummary,
} from "@bb/domain";
import {
  useEnvironment,
  useEnvironmentWorkStatus,
} from "@/hooks/queries/environment-queries";
import { environmentDiffTargetKey } from "@/hooks/queries/query-keys";
import { sdk } from "@/lib/sdk";
import { requireEnabledQueryArg } from "@/hooks/queries/query-helpers";
import type { RequestDiffFileContents } from "@/components/git-diff/GitDiffCardBody";
import type { GitDiffSelectionOption } from "../GitDiffToolbar";
import { useDiffFileContentsRequester } from "../git-diff/useDiffFileContentsRequester";
import {
  ALL_GIT_DIFF_SELECTION,
  COMMITTED_GIT_DIFF_SELECTION,
  UNCOMMITTED_GIT_DIFF_SELECTION,
  buildGitDiffSelectionOptions,
  buildGitDiffTarget,
  type GitDiffSelectionValue,
} from "../git-diff/gitDiffPanelHelpers";
import { fileDiffPatchQueryKey } from "./file-diff-query-key.fork";
import {
  resolveFileDiffPatchState,
  type FileDiffPatchState,
} from "./file-diff-patch.fork";

const FILE_DIFF_PATCH_STALE_MS = 5_000;

export type FileDiffAvailability =
  | { status: "checking" }
  | { status: "available" }
  | { status: "unavailable"; message: string };

export type FileDiffBodyState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | FileDiffPatchState;

interface UseFileDiffArgs {
  enabled: boolean;
  environmentId: string | null | undefined;
  path: string;
}

export interface FileDiffController {
  availability: FileDiffAvailability;
  bodyState: FileDiffBodyState;
  onRequestFileContents: RequestDiffFileContents | undefined;
  onSelectionChange: (value: string) => void;
  options: readonly GitDiffSelectionOption[];
  selectionValue: string;
}

const UNCOMMITTED_ONLY_OPTIONS: readonly GitDiffSelectionOption[] = [
  { label: "Uncommitted changes", value: UNCOMMITTED_GIT_DIFF_SELECTION },
];

// bb-fork(thread-start-ref): picker entries that switch the comparison ref.
export const FILE_DIFF_THREAD_START_VALUE = "thread_start_ref";
export const FILE_DIFF_MERGE_BASE_VALUE = "merge_base_ref";

function shortRef(ref: string): string {
  return ref.slice(0, 7);
}

interface FileDiffOptionArgs {
  commits: readonly WorkspaceCommitSummary[];
  hasUncommittedChanges: boolean;
  isSinceThreadStart: boolean;
  mergeBaseBranch: string | undefined;
  startRef: string;
}

function buildFileDiffOptions({
  commits,
  hasUncommittedChanges,
  isSinceThreadStart,
  mergeBaseBranch,
  startRef,
}: FileDiffOptionArgs): GitDiffSelectionOption[] {
  const changeOptions = isSinceThreadStart
    ? [
        {
          label: "Changes since thread start",
          value: ALL_GIT_DIFF_SELECTION,
        },
        {
          label: "Committed since thread start",
          value: COMMITTED_GIT_DIFF_SELECTION,
        },
      ]
    : buildGitDiffSelectionOptions(commits, { hasUncommittedChanges });
  const commitOptions = commits.map((commit) => ({
    label: commit.subject,
    monoPrefix: commit.shortSha,
    value: commit.sha,
  }));
  const switchOption: GitDiffSelectionOption = isSinceThreadStart
    ? {
        label: mergeBaseBranch
          ? `Compare with merge base (${mergeBaseBranch})`
          : "Compare with merge base",
        value: FILE_DIFF_MERGE_BASE_VALUE,
      }
    : {
        label: `Since thread start (${shortRef(startRef)})`,
        value: FILE_DIFF_THREAD_START_VALUE,
      };
  return [...changeOptions, ...commitOptions, switchOption];
}

export function useFileDiff({
  enabled,
  environmentId,
  path,
}: UseFileDiffArgs): FileDiffController {
  const environmentQuery = useEnvironment(environmentId);
  const environment = environmentQuery.data;
  const mergeBaseBranch = useMemo(
    () => resolveEnvironmentMergeBaseBranch(environment),
    [environment],
  );
  const availability = useMemo<FileDiffAvailability>(() => {
    if (environmentId === null || environmentId === undefined) {
      return {
        status: "unavailable",
        message: "This file is not in a Git workspace.",
      };
    }
    if (environment === undefined) {
      return environmentQuery.isError
        ? {
            status: "unavailable",
            message: "Could not read this workspace's Git state.",
          }
        : { status: "checking" };
    }
    if (!environment.isGitRepo) {
      return {
        status: "unavailable",
        message: "This workspace is not a Git repository.",
      };
    }
    return { status: "available" };
  }, [environment, environmentId, environmentQuery.isError]);

  const [selection, setSelection] = useState<GitDiffSelectionValue>(null);
  const [isSinceThreadStart, setIsSinceThreadStart] = useState(false);
  const startRef = environment?.startRef ?? null;
  const compareRef =
    isSinceThreadStart && startRef !== null ? startRef : mergeBaseBranch;
  const selectionValue =
    selection ??
    (compareRef ? ALL_GIT_DIFF_SELECTION : UNCOMMITTED_GIT_DIFF_SELECTION);
  const target = useMemo(
    () =>
      buildGitDiffTarget(
        selectionValue === ALL_GIT_DIFF_SELECTION ? null : selectionValue,
        compareRef,
      ),
    [compareRef, selectionValue],
  );

  const statusQuery = useEnvironmentWorkStatus(
    environmentId ?? "",
    compareRef,
    {
      enabled: enabled && availability.status === "available",
    },
  );
  const workspaceStatus =
    statusQuery.data?.outcome === "available"
      ? statusQuery.data.workspace
      : undefined;

  const options = useMemo<readonly GitDiffSelectionOption[]>(() => {
    if (startRef === null) {
      return mergeBaseBranch === undefined
        ? UNCOMMITTED_ONLY_OPTIONS
        : buildGitDiffSelectionOptions(
            workspaceStatus?.mergeBase?.commits ?? [],
            {
              hasUncommittedChanges:
                workspaceStatus?.workingTree.hasUncommittedChanges ?? false,
            },
          );
    }
    return buildFileDiffOptions({
      commits: workspaceStatus?.mergeBase?.commits ?? [],
      hasUncommittedChanges:
        workspaceStatus?.workingTree.hasUncommittedChanges ?? false,
      isSinceThreadStart,
      mergeBaseBranch,
      startRef,
    });
  }, [isSinceThreadStart, mergeBaseBranch, startRef, workspaceStatus]);

  const handleSelectionChange = useCallback((value: string) => {
    if (value === FILE_DIFF_THREAD_START_VALUE) {
      setIsSinceThreadStart(true);
      setSelection(null);
      return;
    }
    if (value === FILE_DIFF_MERGE_BASE_VALUE) {
      setIsSinceThreadStart(false);
      setSelection(null);
      return;
    }
    setSelection(value);
  }, []);

  const mergeBaseRef = workspaceStatus?.mergeBase?.baseRef ?? null;
  const onRequestFileContents = useDiffFileContentsRequester({
    environmentId: environmentId ?? undefined,
    target,
    mergeBaseRef,
  });

  const isPatchQueryEnabled =
    enabled &&
    availability.status === "available" &&
    environmentId !== null &&
    environmentId !== undefined &&
    target !== undefined;
  const patchQuery = useQuery({
    queryKey: fileDiffPatchQueryKey(
      environmentId ?? "",
      target?.type ?? null,
      environmentDiffTargetKey(target),
      path,
    ),
    queryFn: ({ signal }) =>
      sdk.environments.diffPatch({
        environmentId: requireEnabledQueryArg({
          value: environmentId,
          hookName: "useFileDiff",
          argName: "environmentId",
        }),
        paths: [path],
        target: requireEnabledQueryArg({
          value: target,
          hookName: "useFileDiff",
          argName: "target",
        }),
        signal,
      }),
    enabled: isPatchQueryEnabled,
    staleTime: FILE_DIFF_PATCH_STALE_MS,
  });

  const bodyState = useMemo<FileDiffBodyState>(() => {
    if (availability.status === "unavailable") {
      return { status: "unavailable", message: availability.message };
    }
    if (patchQuery.isError) {
      return {
        status: "error",
        message:
          patchQuery.error instanceof Error
            ? patchQuery.error.message
            : "Could not load this file's diff.",
      };
    }
    if (patchQuery.data === undefined) {
      return { status: "loading" };
    }
    return resolveFileDiffPatchState(patchQuery.data, path);
  }, [
    availability,
    patchQuery.data,
    patchQuery.error,
    patchQuery.isError,
    path,
  ]);

  return {
    availability,
    bodyState,
    onRequestFileContents,
    onSelectionChange: handleSelectionChange,
    options,
    selectionValue,
  };
}
