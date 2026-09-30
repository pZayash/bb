// bb-fork(file-diff): pure translation of a single-file diff patch response.
import type { EnvironmentDiffPatchResponse } from "@bb/server-contract";
import {
  normalizeFilePatch,
  type ParsedGitDiffFile,
} from "@/components/git-diff/git-diff-parsing";

export type FileDiffPatchState =
  | {
      status: "ready";
      fileDiff: ParsedGitDiffFile;
      patchText: string;
      truncated: boolean;
    }
  | { status: "unavailable"; message: string };

function describeFileDiffPatchFailure(
  response: Exclude<EnvironmentDiffPatchResponse, { outcome: "available" }>,
): string {
  return response.outcome === "not_applicable"
    ? response.message
    : response.failure.message;
}

export function resolveFileDiffPatchState(
  response: EnvironmentDiffPatchResponse,
  path: string,
): FileDiffPatchState {
  if (response.outcome !== "available") {
    return {
      status: "unavailable",
      message: describeFileDiffPatchFailure(response),
    };
  }

  const entry =
    response.patches.find((candidate) => candidate.path === path) ??
    response.patches[0];
  if (entry === undefined) {
    return {
      status: "unavailable",
      message: "No changes to show for this file.",
    };
  }

  const normalized = normalizeFilePatch({
    patch: entry.patch,
    path: entry.path,
  });
  if (normalized === null) {
    return {
      status: "unavailable",
      message: "This file has no text changes to show.",
    };
  }

  return {
    status: "ready",
    fileDiff: normalized.file,
    patchText: normalized.patch,
    truncated: entry.truncated,
  };
}
