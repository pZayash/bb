// bb-fork(windows): Windows fs.watch can report a null filename, which the
// bb-fork(windows): plugin dev loop otherwise treats as "the whole plugin
// bb-fork(windows): changed". Rebuild only when a tracked source file is newer
// bb-fork(windows): than the newest existing build artifact.
import { readdir, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { isIgnoredPluginDevPath } from "./plugin-dev-loop.js";

export async function hasPluginSourceChanges(args: {
  rootDir: string;
  artifactRelativePaths: readonly string[];
}): Promise<boolean> {
  let newestArtifactMs: number | null = null;
  for (const relativePath of args.artifactRelativePaths) {
    try {
      const stats = await stat(join(args.rootDir, relativePath));
      newestArtifactMs =
        newestArtifactMs === null
          ? stats.mtimeMs
          : Math.max(newestArtifactMs, stats.mtimeMs);
    } catch {}
  }
  if (newestArtifactMs === null) return true;

  const pendingDirectories = [""];
  while (pendingDirectories.length > 0) {
    const relativeDirectory = pendingDirectories.pop();
    if (relativeDirectory === undefined) break;
    let entries;
    try {
      entries = await readdir(join(args.rootDir, relativeDirectory), {
        withFileTypes: true,
      });
    } catch {
      return true;
    }
    for (const entry of entries) {
      const relativePath = join(relativeDirectory, entry.name);
      if (isIgnoredPluginDevPath(relativePath)) continue;
      try {
        const entryStats = await stat(join(args.rootDir, relativePath));
        if (entryStats.mtimeMs > newestArtifactMs) return true;
      } catch {
        return true;
      }
      if (entry.isDirectory()) pendingDirectories.push(relativePath);
    }
  }
  return false;
}

// bb-fork(windows): Windows fs.watch emits change events for metadata-only
// bb-fork(windows): updates (attribute and last-access writes from readers,
// bb-fork(windows): indexers, antivirus) under the real filename, so an event
// bb-fork(windows): is treated as a source change only when the reported
// bb-fork(windows): file's mtime is at or after the previous rebuild cycle's
// bb-fork(windows): start. Unverifiable events — the unattributed "." marker
// bb-fork(windows): for a null filename, absolute paths, and vanished files —
// bb-fork(windows): fall back to the full artifact freshness scan (or report
// bb-fork(windows): changed when the file is gone).
export async function pluginSourcesChangedSince(args: {
  rootDir: string;
  relativePaths: readonly string[];
  artifactRelativePaths: readonly string[];
  sinceMs: number;
}): Promise<boolean> {
  for (const relativePath of args.relativePaths) {
    if (relativePath === "." || isAbsolute(relativePath)) {
      return hasPluginSourceChanges({
        rootDir: args.rootDir,
        artifactRelativePaths: args.artifactRelativePaths,
      });
    }
    try {
      const stats = await stat(join(args.rootDir, relativePath));
      if (stats.mtimeMs >= args.sinceMs) return true;
    } catch {
      return true;
    }
  }
  return false;
}
