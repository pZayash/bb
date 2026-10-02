import { posix, win32 } from "node:path";

// bb-fork(windows): the CLI runs on the local machine but resolves file flags for
// bb-fork(windows): the daemon host named by the invoking thread, which may use a different path
// bb-fork(windows): convention than the local one. Pick the resolver from the cwd the host reported
// bb-fork(windows): so a POSIX remote cwd is not reinterpreted as a local drive-relative path.
export function resolveHostPath(cwd: string, file: string): string {
  if (usesWindowsPaths(file)) return win32.resolve(cwd, file);
  if (file.startsWith("/")) return posix.resolve(cwd, file);
  return usesWindowsPaths(cwd)
    ? win32.resolve(cwd, file)
    : posix.resolve(cwd, file);
}

function usesWindowsPaths(value: string): boolean {
  return /^[A-Za-z]:[\\/]/u.test(value) || value.startsWith("\\\\");
}
