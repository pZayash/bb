// bb-fork(thread-start-ref): the first workspace read pins the thread's start commit.
import { getEnvironment } from "@bb/db";
import { describe, expect, it } from "vitest";
import type { HostDaemonOnlineRpcResult } from "@bb/host-daemon-contract";
import { readJson } from "../helpers/json.js";
import {
  waitForQueuedCommand,
  waitForQueuedCommandAfter,
  reportQueuedCommandSuccess,
} from "../helpers/commands.js";
import {
  seedEnvironment,
  seedHostSession,
  seedProjectWithSource,
} from "../helpers/seed.js";
import { withTestHarness, type TestAppHarness } from "../helpers/test-app.js";

function workspaceStatus(
  headSha: string | null,
): HostDaemonOnlineRpcResult<"workspace.status"> {
  return {
    outcome: "available",
    workspaceStatus: {
      workingTree: {
        insertions: 0,
        deletions: 0,
        lineStatsComplete: true,
        files: [],
        hasUncommittedChanges: false,
        state: "clean",
      },
      branch: { currentBranch: "main", defaultBranch: "main" },
      checkout:
        headSha === null
          ? { kind: "unknown", reason: "no head" }
          : { kind: "branch", branchName: "main", headSha },
      mergeBase: null,
    },
  };
}

function seedGitEnvironment(harness: TestAppHarness, suffix: string) {
  const { host } = seedHostSession(harness.deps, {
    id: `host-workspace-start-ref-${suffix}`,
  });
  const { project } = seedProjectWithSource(harness.deps, {
    hostId: host.id,
  });
  const environment = seedEnvironment(harness.deps, {
    hostId: host.id,
    projectId: project.id,
    branchName: "main",
    defaultBranch: "main",
    path: `/tmp/workspace-start-ref-${suffix}`,
    environmentProviderId: "git-worktree",
  });
  return { environment };
}

function startRefOf(harness: TestAppHarness, environmentId: string) {
  return getEnvironment(harness.deps.db, environmentId)?.startRef ?? null;
}

describe("workspace start ref", () => {
  it("pins the observed head sha and never rewrites it", async () => {
    await withTestHarness(async (harness) => {
      const { environment } = seedGitEnvironment(harness, "pin");
      const url = `/api/v1/environments/${environment.id}/status`;
      expect(startRefOf(harness, environment.id)).toBeNull();

      const first = harness.app.request(url);
      const statusCommand = await waitForQueuedCommand(
        harness,
        ({ command }) =>
          command.type === "workspace.status" &&
          command.environmentId === environment.id,
      );
      await reportQueuedCommandSuccess(
        harness,
        statusCommand,
        workspaceStatus("abc1234567890"),
      );
      expect((await first).status).toBe(200);
      expect(startRefOf(harness, environment.id)).toBe("abc1234567890");

      harness.hub.notifyEnvironment(environment.id, ["work-status-changed"]);
      const second = harness.app.request(url);
      const refreshed = await waitForQueuedCommandAfter(
        harness,
        statusCommand.row.cursor,
        ({ command }) =>
          command.type === "workspace.status" &&
          command.environmentId === environment.id,
      );
      await reportQueuedCommandSuccess(
        harness,
        refreshed,
        workspaceStatus("def4567890123"),
      );
      expect((await second).status).toBe(200);
      expect(startRefOf(harness, environment.id)).toBe("abc1234567890");
    });
  });

  it("pins a start commit picked from the routes", async () => {
    await withTestHarness(async (harness) => {
      const { environment } = seedGitEnvironment(harness, "pin-route");

      const response = await harness.app.request(
        `/api/v1/environments/${environment.id}`,
        {
          body: JSON.stringify({ startRef: "def4567890123" }),
          headers: { "content-type": "application/json" },
          method: "PATCH",
        },
      );

      expect(response.status).toBe(200);
      await expect(readJson(response)).resolves.toMatchObject({
        id: environment.id,
        startRef: "def4567890123",
      });
      expect(startRefOf(harness, environment.id)).toBe("def4567890123");
    });
  });

  it("rejects a start commit that is not a commit sha", async () => {
    await withTestHarness(async (harness) => {
      const { environment } = seedGitEnvironment(harness, "reject");

      const response = await harness.app.request(
        `/api/v1/environments/${environment.id}`,
        {
          body: JSON.stringify({ startRef: "not-a-sha" }),
          headers: { "content-type": "application/json" },
          method: "PATCH",
        },
      );

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(startRefOf(harness, environment.id)).toBeNull();
    });
  });

  it("leaves the record empty when the checkout has no head", async () => {
    await withTestHarness(async (harness) => {
      const { environment } = seedGitEnvironment(harness, "no-head");
      const url = `/api/v1/environments/${environment.id}/status`;

      const read = harness.app.request(url);
      const statusCommand = await waitForQueuedCommand(
        harness,
        ({ command }) =>
          command.type === "workspace.status" &&
          command.environmentId === environment.id,
      );
      await reportQueuedCommandSuccess(
        harness,
        statusCommand,
        workspaceStatus(null),
      );
      expect((await read).status).toBe(200);
      expect(startRefOf(harness, environment.id)).toBeNull();
    });
  });
});
