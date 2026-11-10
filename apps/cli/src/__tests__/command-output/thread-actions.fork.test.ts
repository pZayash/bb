// bb-fork(archive-hint): fork-owned coverage for surfacing the unarchive hint
// when a command hits an archived thread.
import { describe, expect, it, vi } from "vitest";
import {
  collectLogLines,
  runCommand,
  setupCommandOutputTestEnvironment,
  stubServerApi,
  type CommandRegistrar,
} from "../helpers/command-output-harness.js";
import { registerThreadCommands } from "../../commands/thread/index.js";

describe("bb thread action command output", () => {
  setupCommandOutputTestEnvironment();

  const register: CommandRegistrar = (program) =>
    registerThreadCommands(program, () => "http://server");

  it("bb thread tell surfaces the unarchive hint from an archived thread", async () => {
    stubServerApi({
      "v1.threads.:id.send.$post": vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              code: "thread_not_writable",
              message:
                "Thread is archived (unarchive it with: bb thread unarchive thread-archived-1)",
              details: {
                reason: "archived",
                archivedAt: 1,
                threadStatus: "idle",
              },
            }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          ),
      ),
    });

    await expect(
      runCommand(["thread", "tell", "thread-archived-1", "Hello"], register),
    ).rejects.toThrow("process.exit:1");

    expect(collectLogLines(vi.mocked(console.error))).toContain(
      "Error: HTTP 409: Thread is archived (unarchive it with: bb thread unarchive thread-archived-1)",
    );
  });
});
