import { getThread, updateThread } from "@bb/db";
import { threadScope } from "@bb/domain";
import {
  groupHostDaemonEvents,
  type HostDaemonEventEnvelope,
} from "@bb/host-daemon-contract";
import { describe, expect, it } from "vitest";
import { internalAuthHeaders } from "../helpers/commands.js";
import {
  seedEnvironment,
  seedHostSession,
  seedProjectWithSource,
  seedThread,
} from "../helpers/seed.js";
import {
  createTestAppHarness,
  type TestAppHarness,
} from "../helpers/test-app.js";

// bb-fork(windows): route coverage for the agent title echo gate.

function setupTitleRoute() {
  return createTestAppHarness().then((harness) => {
    const { host, session } = seedHostSession(harness.deps);
    const { project } = seedProjectWithSource(harness.deps, {
      hostId: host.id,
    });
    const environment = seedEnvironment(harness.deps, {
      hostId: host.id,
      projectId: project.id,
    });
    const thread = seedThread(harness.deps, {
      projectId: project.id,
      environmentId: environment.id,
      status: "active",
      titleFallback: "Move this thread",
    });
    updateThread(harness.deps.db, harness.deps.hub, thread.id, {
      title: null,
    });
    return { harness, session, thread };
  });
}

async function postAgentTitle(
  harness: TestAppHarness,
  sessionId: string,
  threadId: string,
  threadName: string,
) {
  const events: HostDaemonEventEnvelope[] = [
    {
      threadId,
      event: {
        type: "thread/name/updated",
        threadId,
        providerThreadId: "provider-title",
        scope: threadScope(),
        threadName,
        source: "agent",
      },
    },
  ];
  return harness.app.request("/internal/session/events", {
    method: "POST",
    headers: internalAuthHeaders(harness),
    body: JSON.stringify({
      sessionId,
      eventGroups: groupHostDaemonEvents(events),
    }),
  });
}

describe("internal agent title echo gate", () => {
  it("drops an echoed instruction block so a later honest title wins", async () => {
    const { harness, session, thread } = await setupTitleRoute();
    try {
      const echoed = await postAgentTitle(
        harness,
        session.id,
        thread.id,
        "<system_instructions> If the user asks you to move this thread to another che...",
      );
      expect(echoed.status).toBe(200);
      expect(getThread(harness.db, thread.id)?.title).toBeNull();

      const honest = await postAgentTitle(
        harness,
        session.id,
        thread.id,
        "Move thread to another checkout",
      );
      expect(honest.status).toBe(200);
      expect(getThread(harness.db, thread.id)?.title).toBe(
        "Move thread to another checkout",
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("unwraps a real title that follows the echoed block", async () => {
    const { harness, session, thread } = await setupTitleRoute();
    try {
      const response = await postAgentTitle(
        harness,
        session.id,
        thread.id,
        "<system_instructions> Be terse. </system_instructions> Fix thread titles",
      );
      expect(response.status).toBe(200);
      expect(getThread(harness.db, thread.id)?.title).toBe("Fix thread titles");
    } finally {
      await harness.cleanup();
    }
  });
});
