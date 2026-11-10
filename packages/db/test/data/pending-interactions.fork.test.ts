// bb-fork(windows): mass interrupts batch under SQLite variable limits and the
// bb-fork(windows): plugin probe holds a dev hot reload while a form is open.
import { describe, expect, it } from "vitest";
import { noopNotifier } from "../../src/notifier.js";
import { createEnvironment } from "../../src/data/environments.js";
import { upsertHost } from "../../src/data/hosts.js";
import { createProject } from "../../src/data/projects.js";
import {
  createPendingInteraction,
  hasActivePendingInteractionForPlugin,
  interruptPendingInteractionsForThreadIds,
  setPendingInteractionResolved,
} from "../../src/data/pending-interactions.js";
import { createThread } from "../../src/data/threads.js";
import { createMigratedConnection } from "../../src/testing.js";

function setup() {
  const db = createMigratedConnection();
  const host = upsertHost(db, noopNotifier, {
    name: "test-host",
  });
  const { project } = createProject(db, noopNotifier, {
    name: "test-project",
    source: {
      type: "local_path",
      hostId: host.id,
      path: "/tmp/test-project",
    },
  });
  const environment = createEnvironment(db, noopNotifier, {
    providerOwnsPath: false,
    projectId: project.id,
    hostId: host.id,
    status: "ready",
  });
  const thread = createThread(db, noopNotifier, {
    projectId: project.id,
    environmentId: environment.id,
    providerId: "codex",
  });
  const siblingThread = createThread(db, noopNotifier, {
    projectId: project.id,
    environmentId: environment.id,
    providerId: "codex",
  });

  return { db, thread, siblingThread };
}

function commandApprovalPayload(command: string, itemId: string): string {
  return JSON.stringify({
    subject: {
      kind: "command",
      itemId,
      command,
      cwd: "/tmp/project",
    },
    reason: null,
    availableDecisions: ["allow_once", "allow_for_session", "deny"],
  });
}

describe("pending interactions", () => {
  it(
    "chunks thread-id interrupts to stay under SQLite variable limits",
    () => {
      const { db, siblingThread, thread } = setup();
      const threadIds = Array.from(
        { length: 1_050 },
        (_, index) => `thr_missing_batch_${index}`,
      );
      threadIds[0] = thread.id;
      threadIds[1_000] = siblingThread.id;
      const targetThreadIds = [thread.id, siblingThread.id];

      for (const [index, threadId] of targetThreadIds.entries()) {
        createPendingInteraction(db, {
          threadId,
          turnId: `turn-batched-interrupt-thread-${index}`,
          providerId: "codex",
          providerThreadId: `provider-thread-batched-interrupt-thread-${index}`,
          providerRequestId: `request-batched-interrupt-thread-${index}`,
          payload: commandApprovalPayload(
            "git push",
            `item-batched-interrupt-thread-${index}`,
          ),
        });
      }

      expect(
        new Set(
          interruptPendingInteractionsForThreadIds(db, {
            threadIds,
            statusReason: "Thread stopped",
          }).map((row) => row.threadId),
        ),
      ).toEqual(new Set(targetThreadIds));
    },
  );

  it("reports an active plugin interaction only for the plugin that owns it", () => {
    const { db, thread } = setup();
    const created = createPendingInteraction(db, {
      threadId: thread.id,
      originKind: "plugin",
      pluginId: "ask-user-question",
      rendererId: "ask-user-question",
      turnId: null,
      payload: JSON.stringify({ kind: "plugin", title: "Question", data: {} }),
      expiresAt: null,
    });

    expect(hasActivePendingInteractionForPlugin(db, "ask-user-question")).toBe(
      true,
    );
    expect(hasActivePendingInteractionForPlugin(db, "secrets")).toBe(false);

    setPendingInteractionResolved(db, {
      id: created.id,
      resolution: JSON.stringify({ kind: "plugin_submitted" }),
    });

    expect(hasActivePendingInteractionForPlugin(db, "ask-user-question")).toBe(
      false,
    );
  });
});
