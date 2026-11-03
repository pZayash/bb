import { extname } from "node:path";

const WINDOWS_BATCH_EXTENSIONS = new Set([".bat", ".cmd"]);

export function piLaunchRequiresWindowsShell(
  command: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform !== "win32") {
    return false;
  }
  const extension = extname(command).toLowerCase();
  return extension === "" || WINDOWS_BATCH_EXTENSIONS.has(extension);
}
