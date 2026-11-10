// bb-fork(command-snapshot-output): closing a snapshot-streamed command
// bb-fork(command-snapshot-output): carries the last snapshot as its
// bb-fork(command-snapshot-output): aggregated output.
import { describe, expect, it } from "vitest";
import type { ThreadEvent } from "@bb/domain";
import type { ThreadDelta } from "../thread-delta.js";
import {
  createDeltaAssembler,
  type DeltaAssembler,
} from "./delta-assembler.js";

const THREAD_ID = "thr_1";

function createAssembler(): DeltaAssembler {
  return createDeltaAssembler({
    providerId: "pi",
    entropyPrefix: "as-test",
    textDeltaFlushMs: 0,
  });
}

function assemble(
  assembler: DeltaAssembler,
  ...deltas: ThreadDelta[]
): ThreadEvent[] {
  return assembler.assemble({ threadId: THREAD_ID, deltas });
}

function bashOpen(providerItemId: string): ThreadDelta {
  return {
    kind: "item.open",
    key: { providerItemId },
    item: { type: "command", command: "npm test", cwd: "/repo" },
  };
}

describe("delta assembler text-delta batching", () => {
  it("closes a snapshot-streamed command with the last snapshot as aggregated output", () => {
    const assembler = createAssembler();
    assemble(assembler, { kind: "turn.open" }, bashOpen("cmd-1"));
    const key = { providerItemId: "cmd-1" };
    assemble(assembler, {
      kind: "command.outputSnapshot",
      key,
      text: "line 1\n",
    });
    assemble(assembler, {
      kind: "command.outputSnapshot",
      key,
      text: "line 1\nline 2\n",
    });

    const events = assemble(assembler, {
      kind: "item.close",
      key,
      status: "completed",
      exitCode: 0,
      item: { type: "command", command: "npm test", cwd: "/repo" },
    });
    const completed = events.find((event) => event.type === "item/completed");
    expect(completed).toMatchObject({
      item: expect.objectContaining({
        type: "commandExecution",
        aggregatedOutput: "line 1\nline 2\n",
      }),
    });
  });

  it("prefers an explicit aggregated output over the streamed snapshot", () => {
    const assembler = createAssembler();
    assemble(assembler, { kind: "turn.open" }, bashOpen("cmd-1"));
    const key = { providerItemId: "cmd-1" };
    assemble(assembler, {
      kind: "command.outputSnapshot",
      key,
      text: "streamed\n",
    });

    const events = assemble(assembler, {
      kind: "item.close",
      key,
      status: "completed",
      exitCode: 0,
      aggregatedOutput: "final\n",
      item: { type: "command", command: "npm test", cwd: "/repo" },
    });
    const completed = events.find((event) => event.type === "item/completed");
    expect(completed).toMatchObject({
      item: expect.objectContaining({ aggregatedOutput: "final\n" }),
    });
  });

  it("does not invent aggregated output for incremental output deltas", () => {
    const assembler = createAssembler();
    assemble(assembler, { kind: "turn.open" }, bashOpen("cmd-1"));
    const key = { providerItemId: "cmd-1" };
    assemble(assembler, {
      kind: "item.outputDelta",
      key,
      channel: "command",
      text: "line 1\n",
    });

    const events = assemble(assembler, {
      kind: "item.close",
      key,
      status: "completed",
      exitCode: 0,
      item: { type: "command", command: "npm test", cwd: "/repo" },
    });
    const completed = events.find((event) => event.type === "item/completed");
    if (completed?.type !== "item/completed") {
      throw new Error("expected item/completed");
    }
    expect(completed.item).not.toHaveProperty("aggregatedOutput");
  });
});
