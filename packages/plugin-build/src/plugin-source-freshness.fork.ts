// bb-fork(windows): Windows fs.watch can report a null filename, which the
// bb-fork(windows): plugin dev loop otherwise treats as "the whole plugin
// bb-fork(windows): changed". Rebuild only when a tracked source file is newer
// bb-fork(windows): than the newest existing build artifact.
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
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
