import {
  archiveThread,
  getThread,
  listEvents,
  listQueuedThreadMessages,
} from "@bb/db";
import { queueParentSystemMessage } from "../../src/services/threads/parent-system-messages.js";
import { describe, expect, it } from "vitest";
import {
  seedEnvironment,
  seedHostSession,
  seedProjectWithSource,
  seedQueuedMessage,
  seedThread,
} from "../helpers/seed.js";
import { textInput } from "../helpers/prompt-input.js";
import { readJson } from "../helpers/json.js";
import { withTestHarness, type TestAppHarness } from "../helpers/test-app.js";

interface ArchivedFixture {
  environmentId: string;
  queuedMessageId: string;
  threadId: string;
}

async function seedArchivedThread(
  harness: TestAppHarness,
): Promise<ArchivedFixture> {
  const { host } = seedHostSession(harness.deps);
  const { project } = seedProjectWithSource(harness.deps, { hostId: host.id });
  const environment = seedEnvironment(harness.deps, {
    hostId: host.id,
    projectId: project.id,
  });
  const thread = seedThread(harness.deps, {
    projectId: project.id,
    environmentId: environment.id,
    providerId: "codex",
    status: "idle",
  });
  const queued = seedQueuedMessage(harness.deps, {
    threadId: thread.id,
    content: textInput("Already queued"),
  });
  archiveThread(harness.db, harness.deps.hub, thread.id);
  return {
    environmentId: environment.id,
    queuedMessageId: queued.id,
    threadId: thread.id,
  };
}

async function postJson(
  harness: TestAppHarness,
  path: string,
  body: unknown,
  method = "POST",
): Promise<Response> {
  return harness.app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function threadRequestEvents(harness: TestAppHarness, threadId: string) {
  return listEvents(harness.db, { threadId }).filter(
    (event) => event.type === "client/turn/requested",
  );
}

describe("archived thread write paths", () => {
  it("refuses every message write with a 409 and never appends a turn request", async () => {
    await withTestHarness(async (harness) => {
      const fixture = await seedArchivedThread(harness);
      const base = `/api/v1/threads/${fixture.threadId}`;
      const message = [{ type: "text", text: "New work" }];

      const send = await postJson(harness, `${base}/send`, {
        input: message,
        mode: "queue-if-active",
      });
      expect(send.status).toBe(409);
      const sendBody = await readJson(send);
      expect(sendBody).toMatchObject({
        code: "thread_not_writable",
        details: { reason: "archived" },
        message: expect.stringContaining(
          `bb thread unarchive ${fixture.threadId}`,
        ),
      });

      const queue = await postJson(harness, `${base}/queued-messages`, {
        input: message,
      });
      expect(queue.status).toBe(409);
      expect(await readJson(queue)).toMatchObject({
        code: "thread_not_writable",
        details: { reason: "archived" },
      });

      const queuedPath = `${base}/queued-messages/${fixture.queuedMessageId}`;
      expect(
        (
          await postJson(
            harness,
            queuedPath,
            {
              expectedUpdatedAt: 0,
              input: message,
            },
            "PATCH",
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await postJson(
            harness,
            `${queuedPath}/order`,
            {
              previousQueuedMessageId: null,
              nextQueuedMessageId: null,
            },
            "PATCH",
          )
        ).status,
      ).toBe(409);
      expect(
        (await postJson(harness, `${queuedPath}/send`, { mode: "auto" }))
          .status,
      ).toBe(409);

      expect(threadRequestEvents(harness, fixture.threadId)).toHaveLength(0);
      expect(
        listQueuedThreadMessages(harness.db, fixture.threadId),
      ).toHaveLength(1);
      expect(getThread(harness.db, fixture.threadId)?.status).toBe("idle");
    });
  });

  it("refuses retry, compact, clear, draft, and edit on an archived thread", async () => {
    await withTestHarness(async (harness) => {
      const fixture = await seedArchivedThread(harness);
      const base = `/api/v1/threads/${fixture.threadId}`;

      for (const path of [
        `${base}/retry`,
        `${base}/compact`,
        `${base}/context/clear`,
      ]) {
        const response = await postJson(harness, path, {});
        expect(response.status, path).toBe(409);
        expect(await readJson(response), path).toMatchObject({
          message: expect.stringContaining(
            `bb thread unarchive ${fixture.threadId}`,
          ),
        });
      }

      const edit = await postJson(harness, `${base}/edit-message`, {
        input: [{ type: "text", text: "Edited" }],
        operationId: "op_archived",
      });
      expect(edit.status).toBe(409);
      expect(await readJson(edit)).toMatchObject({
        message: expect.stringContaining(
          `bb thread unarchive ${fixture.threadId}`,
        ),
      });

      const draft = await postJson(
        harness,
        `${base}/draft`,
        { input: [{ type: "text", text: "Draft" }] },
        "PUT",
      );
      expect(draft.status).toBe(409);
      expect(await readJson(draft)).toMatchObject({
        message: expect.stringContaining("Unarchive the thread"),
      });

      expect(threadRequestEvents(harness, fixture.threadId)).toHaveLength(0);
    });
  });

  it("still allows discarding a queued message without writing to the thread", async () => {
    await withTestHarness(async (harness) => {
      const fixture = await seedArchivedThread(harness);
      const response = await harness.app.request(
        `/api/v1/threads/${fixture.threadId}/queued-messages/${fixture.queuedMessageId}`,
        { method: "DELETE" },
      );
      expect(response.status).toBe(200);
      expect(
        listQueuedThreadMessages(harness.db, fixture.threadId),
      ).toHaveLength(0);
      expect(threadRequestEvents(harness, fixture.threadId)).toHaveLength(0);
    });
  });

  it("does not deliver a child outcome notice to an archived parent", async () => {
    await withTestHarness(async (harness) => {
      const { host } = seedHostSession(harness.deps);
      const { project } = seedProjectWithSource(harness.deps, {
        hostId: host.id,
      });
      const environment = seedEnvironment(harness.deps, {
        hostId: host.id,
        projectId: project.id,
      });
      const parent = seedThread(harness.deps, {
        projectId: project.id,
        environmentId: environment.id,
      });
      archiveThread(harness.db, harness.deps.hub, parent.id);

      const delivered = await queueParentSystemMessage(harness.deps, {
        input: textInput("A child completed"),
        parentThreadId: parent.id,
        systemMessageKind: "child-completed",
        systemMessageSubject: null,
      });

      expect(delivered).toBe(false);
      expect(threadRequestEvents(harness, parent.id)).toHaveLength(0);
      expect(listQueuedThreadMessages(harness.db, parent.id)).toHaveLength(0);
    });
  });
});
