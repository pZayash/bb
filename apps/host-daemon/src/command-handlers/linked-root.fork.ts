// bb-fork(windows): a project may keep .bb/skills symlinked to a shared
// directory; resolveNonSymlinkDirectoryPath rejects that root outright, which
// would fail the whole agent-context read. This variant follows the root link
// but still anchors entry reads at the resolved path.
import fs from "node:fs/promises";
import { CommandDispatchError } from "../command-dispatch-support.js";

interface ResolveDirectoryPathArgs {
  description: string;
  path: string;
}

export async function resolveLinkedDirectoryPath(
  args: ResolveDirectoryPathArgs,
): Promise<string> {
  const rootStat = await fs.lstat(args.path);
  if (!rootStat.isDirectory() && !rootStat.isSymbolicLink()) {
    throw new CommandDispatchError(
      "invalid_path",
      `${args.description} "${args.path}" is not a directory`,
    );
  }
  return fs.realpath(args.path);
}
