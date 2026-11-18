import {
  listLastStoredTurnRequestEvents,
  listProjectExecutionDefaultsByProjectIds,
  type DbConnection,
} from "@bb/db";
import type { ReasoningLevel } from "@bb/domain";
import { parseStoredTurnRequestEvent } from "./thread-events.js";

// bb-fork(thread-row-metadata): the sidebar shows the model and its reasoning
// level, so the row needs both resolved the way the next turn resolves them.
export interface ThreadExecutionResolution {
  model: string | null;
  reasoningLevel: ReasoningLevel | null;
}

export interface ThreadExecutionResolutionInput {
  id: string;
  projectId: string;
  providerId: string;
  modelOverride: string | null;
  reasoningLevelOverride: ReasoningLevel | null;
}

export function buildThreadExecutionByThreadId(
  db: DbConnection,
  threads: readonly ThreadExecutionResolutionInput[],
): Map<string, ThreadExecutionResolution> {
  const executionByThreadId = new Map<string, ThreadExecutionResolution>();
  if (threads.length === 0) {
    return executionByThreadId;
  }
  const defaultsByProjectId = listProjectExecutionDefaultsByProjectIds(db, {
    projectIds: [...new Set(threads.map((thread) => thread.projectId))],
  });
  const lastExecutionByThreadId = new Map<string, ThreadExecutionResolution>();
  for (const row of listLastStoredTurnRequestEvents(db, {
    threadIds: threads.map((thread) => thread.id),
  })) {
    try {
      const execution = parseStoredTurnRequestEvent(row).execution;
      lastExecutionByThreadId.set(row.threadId, {
        model: execution.model,
        reasoningLevel: execution.reasoningLevel,
      });
    } catch {
      continue;
    }
  }
  for (const thread of threads) {
    const projectDefault = defaultsByProjectId.get(thread.projectId);
    const projectApplies = projectDefault?.providerId === thread.providerId;
    const lastExecution = lastExecutionByThreadId.get(thread.id);
    const model =
      thread.modelOverride ??
      lastExecution?.model ??
      (projectApplies ? projectDefault?.model : undefined);
    const reasoningLevel =
      thread.reasoningLevelOverride ??
      lastExecution?.reasoningLevel ??
      (projectApplies ? projectDefault?.reasoningLevel : undefined);
    if (model !== undefined || reasoningLevel !== undefined) {
      executionByThreadId.set(thread.id, {
        model: model ?? null,
        reasoningLevel: reasoningLevel ?? null,
      });
    }
  }
  return executionByThreadId;
}
