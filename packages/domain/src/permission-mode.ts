import { permissionModeRank, type PermissionMode } from "./shared-types.js";

export function reconcilePermissionMode(
  candidate: PermissionMode,
  supported: readonly PermissionMode[],
): PermissionMode {
  if (supported.length === 0) {
    throw new Error(
      "reconcilePermissionMode requires at least one supported mode",
    );
  }
  if (supported.includes(candidate)) {
    return candidate;
  }
  const atOrBelow = supported.filter(
    (mode) => permissionModeRank(mode) <= permissionModeRank(candidate),
  );
  if (atOrBelow.length > 0) {
    return atOrBelow.reduce((highest, mode) =>
      permissionModeRank(mode) > permissionModeRank(highest) ? mode : highest,
    );
  }
  return supported.reduce((lowest, mode) =>
    permissionModeRank(mode) < permissionModeRank(lowest) ? mode : lowest,
  );
}
