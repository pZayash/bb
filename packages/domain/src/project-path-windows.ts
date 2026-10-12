const WINDOWS_DRIVE_ROOT_PATTERN = /^[A-Za-z]:(?:[\\/]+)?$/u;

export function isWindowsFilesystemRoot(path: string): boolean {
  return WINDOWS_DRIVE_ROOT_PATTERN.test(path);
}

export function deriveWindowsProjectName(normalizedPath: string): string {
  if (isWindowsFilesystemRoot(normalizedPath)) {
    return "";
  }
  return (
    normalizedPath
      .split(/[\\/]+/u)
      .filter(Boolean)
      .at(-1) ?? ""
  );
}

const WINDOWS_DRIVE_PATTERN = /^[A-Za-z]:(?:[\\/]+|$)/u;
const WINDOWS_UNC_PATTERN = /^\\\\[^\\/]+(?:[\\/]+)[^\\/]+/u;

export function isNativeWindowsProjectPath(path: string): boolean {
  const trimmedPath = path.trim();
  if (!trimmedPath) {
    return false;
  }

  return (
    WINDOWS_DRIVE_ROOT_PATTERN.test(trimmedPath) ||
    WINDOWS_DRIVE_PATTERN.test(trimmedPath) ||
    WINDOWS_UNC_PATTERN.test(trimmedPath)
  );
}
