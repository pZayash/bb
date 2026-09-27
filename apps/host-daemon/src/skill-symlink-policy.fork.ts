import fs from "node:fs";
import { isPathWithinDirectory } from "@bb/process-utils";

// bb-fork(windows): project-origin skill symlinks were skipped entirely, so a
// kit/harness layout (`.pi/skills/<name>` -> `harness/...`) never reached the
// skill list or the `/` typeahead even when the target stays in the workspace.

export interface ForkSkillSymlinkRoot {
  boundaryPath?: string;
  origin: "project" | "user";
  source: "skill" | "command";
}

let cachedBoundaryPath: string | null = null;
let cachedResolvedBoundary: string | null = null;

function realpathOrNull(targetPath: string): string | null {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return null;
  }
}

function resolveBoundary(boundaryPath: string): string | null {
  if (cachedBoundaryPath !== boundaryPath) {
    cachedBoundaryPath = boundaryPath;
    cachedResolvedBoundary = realpathOrNull(boundaryPath);
  }
  return cachedResolvedBoundary;
}

export function forkCanFollowSkillSymlink(
  root: ForkSkillSymlinkRoot,
  linkPath: string,
): boolean {
  if (root.source !== "skill") {
    return false;
  }
  if (root.origin === "user") {
    return true;
  }
  if (root.boundaryPath === undefined) {
    return false;
  }
  const resolvedBoundary = resolveBoundary(root.boundaryPath);
  if (resolvedBoundary === null) {
    return false;
  }
  const resolvedTarget = realpathOrNull(linkPath);
  return (
    resolvedTarget !== null &&
    isPathWithinDirectory(resolvedBoundary, resolvedTarget)
  );
}
