// bb-fork(compaction-model): the configured compaction model is session
// bb-fork(compaction-model): construction, so a changed value rebuilds the
// bb-fork(compaction-model): session like env changes do.
import { afterEach, beforeEach, expect, it } from "vitest";
import { z } from "zod";
import type {
  BridgeJsonRpcObject,
  BridgeJsonRpcOutputMessage,
} from "@get-bb/plugin-sdk/provider-bridge/testing";
import {
  FULL_PERMISSION_OPTIONS,
  type FakePiBridgeHarness,
  startFakePiBridge,
} from "./test-support.js";

const TURN_OPTIONS_TEST_TIMEOUT_MS = 60_000;

const MINI = {
  ...FULL_PERMISSION_OPTIONS,
  model: "fake-provider/fake-mini",
  reasoningLevel: "medium",
};

const sessionReplacedParamsSchema = z.object({
  threadId: z.string(),
  providerThreadId: z.string().nullable(),
  reason: z.string(),
  contextLost: z.boolean(),
});

let harness: FakePiBridgeHarness;

beforeEach(async () => {
  harness = await startFakePiBridge({
    prefix: "bb-pi-turn-options-",
    initialize: true,
  });
}, 30_000);

afterEach(async () => {
  await harness.teardown();
}, 30_000);

function sessionReplacements(
  threadId: string,
): z.infer<typeof sessionReplacedParamsSchema>[] {
  return harness.messages
    .filter((message) => message.method === "session/replaced")
    .map((message) => sessionReplacedParamsSchema.parse(message.params))
    .filter((params) => params.threadId === threadId);
}

function providerThreadIdFor(threadId: string): string {
  const identity = [...harness.messages]
    .reverse()
    .find(
      (message) =>
        message.method === "thread/identity" &&
        (message.params as { threadId?: unknown }).threadId === threadId,
    );
  const providerThreadId = (identity?.params as { providerThreadId?: unknown })
    .providerThreadId;
  expect(typeof providerThreadId).toBe("string");
  if (typeof providerThreadId !== "string")
    throw new Error("missing provider thread identity");
  return providerThreadId;
}

function turnStart(
  id: number,
  threadId: string,
  text: string,
  options: BridgeJsonRpcObject,
): Promise<BridgeJsonRpcOutputMessage> {
  return harness.request(id, "turn/start", {
    threadId,
    providerThreadId: providerThreadIdFor(threadId),
    clientRequestId: `creq_abcdefghi${"23456789"[id % 8] ?? "2"}`,
    input: [{ type: "text", text, mentions: [] }],
    options,
  });
}

it(
  "rebuilds the session when the compaction model option changes",
  async () => {
    const threadId = "thr_turn_options_compaction_model";
    const options = (compactionModel?: string) => ({
      ...MINI,
      providerOptions: (compactionModel === undefined
        ? {}
        : { compactionModel }) as Record<string, string>,
    });
    await harness.startThread(threadId, {
      options: options("deepseek/deepseek-flash"),
    });

    expect(
      (
        await turnStart(
          1,
          threadId,
          "first",
          options("deepseek/deepseek-flash"),
        )
      ).error,
    ).toBeUndefined();
    let seen = await harness.waitForTurnBoundary(threadId, 0);
    expect(sessionReplacements(threadId)).toEqual([]);

    expect(
      (await turnStart(2, threadId, "second", options("other/model"))).error,
    ).toBeUndefined();
    seen = await harness.waitForTurnBoundary(threadId, seen);
    expect(sessionReplacements(threadId)).toHaveLength(1);

    expect(
      (await turnStart(3, threadId, "third", options())).error,
    ).toBeUndefined();
    await harness.waitForTurnBoundary(threadId, seen);
    expect(sessionReplacements(threadId)).toHaveLength(2);
  },
  TURN_OPTIONS_TEST_TIMEOUT_MS,
);
