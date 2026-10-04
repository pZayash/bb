import { getLatestThreadSequence, listEvents } from "@bb/db";
import { groupHostDaemonEvents } from "@bb/host-daemon-contract";
import {
  createStandaloneBuiltinCompactCommandInput,
  turnRequestEventDataSchema,
  turnScope,
  type PromptInput,
} from "@bb/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appendClientTurnEvent } from "../../src/services/threads/thread-events.js";
import {
  seedEvent,
  seedThread,
  seedThreadFixture,
  seedThreadRuntimeState,
} from "../helpers/seed.js";
import { textInput } from "../helpers/prompt-input.js";
import { internalAuthHeaders } from "../helpers/commands.js";
import { withTestHarness, type TestAppHarness } from "../helpers/test-app.js";

function seedParentAndChild(harness: TestAppHarness) {
  const {
    project,
    environment,
    session,
    thread: parent,
  } = seedThreadFixture(harness);
  seedThreadRuntimeState(harness.deps, {
    threadId: parent.id,
    environmentId: environment.id,
    providerThreadId: "parent-provider-thread",
  });
  const child = seedThread(harness.deps, {
    projectId: project.id,
    environmentId: environment.id,
    parentThreadId: parent.id,
    status: "active",
    title: "Worker child",
  });
  return { parent, child, environment, session };
}

function parentSystemRequests(harness: TestAppHarness, parentThreadId: string) {
  return listEvents(harness.db, { threadId: parentThreadId })
    .filter((row) => row.type === "client/turn/requested")
    .map((row) => turnRequestEventDataSchema.parse(JSON.parse(row.data)))
    .filter((data) => data.initiator === "system");
}

function seedTurnRequest(
  harness: TestAppHarness,
  args: {
    childId: string;
    environmentId: string;
    input: PromptInput[];
    turnId: string;
  },
): void {
  const request = appendClientTurnEvent(harness.deps, {
    threadId: args.childId,
    environmentId: args.environmentId,
    type: "client/turn/requested",
    input: args.input,
    target: { kind: "new-turn" },
    execution: {
      model: "gpt-5",
      reasoningLevel: "medium",
      permissionMode: "full",
      serviceTier: "default",
      source: "client/turn/requested",
    },
    initiator: "user",
    senderThreadId: null,
    requestMethod: "turn/start",
    source: "tell",
  });
  const providerThreadId = `provider-${args.turnId}`;
  const sequence =
    getLatestThreadSequence(harness.db, { threadId: args.childId }) + 1;
  seedEvent(harness.deps, {
    threadId: args.childId,
    environmentId: args.environmentId,
    providerThreadId,
    sequence,
    type: "turn/started",
    scope: turnScope(args.turnId),
    data: { providerThreadId },
  });
  seedEvent(harness.deps, {
    threadId: args.childId,
    environmentId: args.environmentId,
    providerThreadId,
    sequence: sequence + 1,
    type: "turn/input/accepted",
    scope: turnScope(args.turnId),
    data: { providerThreadId, clientRequestId: request.requestId },
  });
}

async function postTurnCompleted(
  harness: TestAppHarness,
  args: { childId: string; sessionId: string; turnId: string },
): Promise<void> {
  const providerThreadId = `provider-${args.turnId}`;
  const response = await harness.app.request("/internal/session/events", {
    method: "POST",
    headers: internalAuthHeaders(harness),
    body: JSON.stringify({
      sessionId: args.sessionId,
      eventGroups: groupHostDaemonEvents([
        {
          threadId: args.childId,
          event: {
            type: "turn/completed",
            threadId: args.childId,
            providerThreadId,
            scope: turnScope(args.turnId),
            status: "completed",
          },
        },
      ]),
    }),
  });
  expect(response.status).toBe(200);
}

afterEach(() => vi.useRealTimers());

describe("manual compaction turn parent notifications", () => {
  it("does not report a completed manual compaction to the parent", async () => {
    await withTestHarness(async (harness) => {
      const { parent, child, environment, session } =
        seedParentAndChild(harness);
      seedTurnRequest(harness, {
        childId: child.id,
        environmentId: environment.id,
        input: createStandaloneBuiltinCompactCommandInput(),
        turnId: "child-compaction-turn",
      });

      vi.useFakeTimers();
      await postTurnCompleted(harness, {
        childId: child.id,
        sessionId: session.id,
        turnId: "child-compaction-turn",
      });
      await vi.advanceTimersByTimeAsync(2_000);
      vi.useRealTimers();

      expect(parentSystemRequests(harness, parent.id)).toHaveLength(0);
    });
  });

  it("still reports a normal completed turn to the parent", async () => {
    await withTestHarness(async (harness) => {
      const { parent, child, environment, session } =
        seedParentAndChild(harness);
      seedTurnRequest(harness, {
        childId: child.id,
        environmentId: environment.id,
        input: textInput("Do the work"),
        turnId: "child-normal-turn",
      });

      vi.useFakeTimers();
      await postTurnCompleted(harness, {
        childId: child.id,
        sessionId: session.id,
        turnId: "child-normal-turn",
      });
      await vi.advanceTimersByTimeAsync(2_000);
      vi.useRealTimers();

      expect(parentSystemRequests(harness, parent.id)).toMatchObject([
        { systemMessageKind: "child-completed" },
      ]);
    });
  });
});
