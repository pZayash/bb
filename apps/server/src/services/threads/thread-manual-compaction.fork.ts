// bb-fork(compact-notify): a manual compaction turn is a service operation,
// not task progress, so its completion must not be reported as a child outcome.
import { getStoredTurnRequestEventForTurn } from "@bb/db";
import { isStandaloneBuiltinCompactCommand } from "@bb/domain";
import type { AppDeps } from "../../types.js";
import { parseStoredTurnRequestEvent } from "./thread-events.js";

export function isManualCompactionTurn(
  deps: Pick<AppDeps, "db">,
  args: { threadId: string; turnId: string },
): boolean {
  const requestRow = getStoredTurnRequestEventForTurn(deps.db, args);
  if (!requestRow) {
    return false;
  }
  const request = parseStoredTurnRequestEvent(requestRow);
  return (
    request.target.kind === "new-turn" &&
    isStandaloneBuiltinCompactCommand(request.input)
  );
}
