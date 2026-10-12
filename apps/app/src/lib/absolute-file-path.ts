import {
  getHostPathDirname,
  isAbsoluteHostPath,
  isHostPathWithin,
  isWindowsHostPath,
  joinHostPath,
  normalizeHostPath,
} from "@bb/domain";

interface ResolveAbsoluteFilePathArgs {
  path: string;
  rootPath: string | null | undefined;
}

interface BuildAbsoluteFilePathArgs {
  path: string;
  rootPath: string;
}

interface GetAbsoluteDirnameArgs {
  path: string;
}

interface IsAbsoluteFilePathWithinRootArgs {
  candidatePath: string;
  rootPath: string;
}

interface NormalizeAbsoluteFilePathArgs {
  path: string;
}

function trimTrailingSlash(path: string): string {
  if (path === "/") {
    return path;
  }
  return path.replace(/\/+$/u, "");
}

function trimLeadingSlash(path: string): string {
  return path.replace(/^\/+/u, "");
}

function isAbsoluteFilePath(path: string): boolean {
  return isAbsoluteHostPath(path);
}

// bb-fork(windows): native Windows inputs keep forward-slash form with a
// lowercase drive letter so the result stays comparable to POSIX-style paths.
function toForkNormalizedForm(value: string): string {
  const windowsMatch = /^([A-Za-z]):[\\/]/u.exec(value);
  if (windowsMatch !== null) {
    const rest = value.slice(3).replaceAll("\\", "/");
    return rest.length === 0
      ? `${windowsMatch[1]!.toLowerCase()}:`
      : `${windowsMatch[1]!.toLowerCase()}:/${rest}`;
  }
  if (value.startsWith("\\")) {
    return `//${value.slice(2).replaceAll("\\", "/")}`;
  }
  return value;
}

// bb-fork(windows): separators only — preserve the drive letter's casing.
function toForwardSlashes(value: string): string {
  return value.includes("\\") ? value.replaceAll("\\", "/") : value;
}

export function normalizeAbsoluteFilePath({
  path,
}: NormalizeAbsoluteFilePathArgs): string | null {
  const normalized = normalizeHostPath(path);
  return normalized === null ? null : toForkNormalizedForm(normalized);
}

export function isAbsoluteFilePathWithinRoot({
  candidatePath,
  rootPath,
}: IsAbsoluteFilePathWithinRootArgs): boolean {
  return isHostPathWithin({ rootPath, candidatePath });
}

export function buildAbsoluteFilePath({
  path,
  rootPath,
}: BuildAbsoluteFilePathArgs): string {
  if (isAbsoluteFilePath(path)) {
    return path;
  }

  if (isWindowsHostPath(rootPath)) {
    const joined = joinHostPath({ rootPath, relativePath: path });
    return joined === null ? path : toForwardSlashes(joined);
  }

  const normalizedRootPath = trimTrailingSlash(rootPath);
  const relativePath = trimLeadingSlash(path);
  if (normalizedRootPath === "/") {
    return `/${relativePath}`;
  }
  return `${normalizedRootPath}/${relativePath}`;
}

export function resolveAbsoluteFilePath({
  path,
  rootPath,
}: ResolveAbsoluteFilePathArgs): string | null {
  if (isAbsoluteFilePath(path)) {
    return path;
  }
  if (!rootPath) {
    return null;
  }
  return buildAbsoluteFilePath({ path, rootPath });
}

export function getAbsoluteDirname({ path }: GetAbsoluteDirnameArgs): string {
  if (isWindowsHostPath(path)) {
    const dirname = getHostPathDirname(path);
    if (dirname === null) return path;
    const converted = toForwardSlashes(dirname);
    // bb-fork(windows): keep the caller's drive letter casing.
    return /^[A-Za-z]:/u.test(path) ? path[0] + converted.slice(1) : converted;
  }
  const trimmed = trimTrailingSlash(path);
  const lastSlashIndex = trimmed.lastIndexOf("/");
  if (lastSlashIndex === 0) {
    return "/";
  }
  return trimmed.slice(0, lastSlashIndex);
}
