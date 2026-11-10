// bb-fork(windows): the sidebar row resolves each thread's last-turn model, so
// bb-fork(windows): the per-thread latest request lookup needs coverage.
import { describe, expect, it } from "vitest";
import {
  threadScope,
  type PromptInput,
} from "@bb/domain";
import { noopNotifier } from "../../src/notifier.js";
import {
  appendStoredThreadEvent,
  listLastStoredTurnRequestEvents,
} from "../../src/data/events.js";
import { createProject } from "../../src/data/projects.js";
import { createThread } from "../../src/data/threads.js";
import { upsertHost } from "../../src/data/hosts.js";
import { createMigratedConnection } from "../../src/testing.js";

function setup() {
  const db = createMigratedConnection();
  const host = upsertHost(db, noopNotifier, {
    name: "test-host",
  });
  const { project } = createProject(db, noopNotifier, {
    name: "test-project",
    source: { type: "local_path", hostId: host.id, path: "/tmp/test" },
  });
  const thread = createThread(db, noopNotifier, {
    status: "idle",
    projectId: project.id,
    providerId: "codex",
  });
  return { db, project, thread };
}

function textInput(text: string): PromptInput[] {
  return [{ type: "text", text, mentions: [] }];
}

describe("events", () => {
  it("lists each thread's last turn request and omits threads without one", () => {
    const { db, project, thread } = setup();
    const other = createThread(db, noopNotifier, {
      projectId: project.id,
      providerId: "codex",
    });
    const untouched = createThread(db, noopNotifier, {
      projectId: project.id,
      providerId: "codex",
    });
    const requestIds = [
      "creq_23456789a1",
      "creq_23456789a2",
      "creq_23456789a3",
    ] as const;
    const appendRequest = (
      threadId: string,
      requestId: string,
      model: string,
    ) =>
      appendStoredThreadEvent(db, noopNotifier, {
        threadId,
        scope: threadScope(),
        type: "client/turn/requested",
        data: {
          direction: "outbound",
          source: "tell",
          initiator: "user",
          senderThreadId: null,
          requestId,
          input: textInput("hello"),
          target: { kind: "new-turn" },
          request: { method: "turn/start", params: {} },
          execution: {
            model,
            reasoningLevel: "medium",
            permissionMode: "workspace-write",
            source: "client/turn/requested",
            serviceTier: "default",
          },
        },
      });

    appendRequest(thread.id, requestIds[0], "gpt-5");
    appendRequest(thread.id, requestIds[1], "gpt-5-mini");
    appendRequest(other.id, requestIds[2], "claude-sonnet-4-5");

    const rows = listLastStoredTurnRequestEvents(db, {
      threadIds: [thread.id, other.id, untouched.id],
    });
    const rowByThreadId = new Map(rows.map((row) => [row.threadId, row]));

    expect(rows).toHaveLength(2);
    expect(rowByThreadId.get(thread.id)?.data).toContain(
      '"model":"gpt-5-mini"',
    );
    expect(rowByThreadId.get(thread.id)?.data).not.toContain(
      '"model":"gpt-5"',
    );
    expect(rowByThreadId.get(other.id)?.data).toContain(
      '"model":"claude-sonnet-4-5"',
    );
    expect(rowByThreadId.has(untouched.id)).toBe(false);
  });
});
