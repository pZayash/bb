// bb-fork(contract-fields): fork-owned contract coverage. Everything that can
// live outside the upstream contract.test.ts does, so the upstream file keeps
// only the minimal marked deltas the fork schemas force on it.
import { collectOptionalFieldPaths } from "@bb/test-helpers";
import { describe, expect, it } from "vitest";
import * as contract from "../src/index.js";
import { createThreadRequestSchema } from "../src/index.js";

const FORK_OPTIONAL_SERVER_FIELDS: string[] = [
  // bb-fork(thread-start-ref): the start-commit baseline is PATCHed the same way.
  "updateEnvironmentRequestSchema.startRef",
  // bb-fork(quiet-reparent): omitted keeps the default parent notification
  "updateThreadRequestSchema.ownershipNotice",
  // bb-fork(parent-mute): omitted leaves the mute state untouched
  "updateThreadRequestSchema.parentNotificationsMuted",
];

describe("server-contract fork schema deltas", () => {
  it("keeps fork optional fields discoverable as optional", () => {
    const optionalFieldPaths = collectOptionalFieldPaths({
      updateEnvironmentRequestSchema: contract.updateEnvironmentRequestSchema,
      updateThreadRequestSchema: contract.updateThreadRequestSchema,
    });
    expect(optionalFieldPaths).toEqual(
      expect.arrayContaining(FORK_OPTIONAL_SERVER_FIELDS),
    );
  });

  it("accepts fork fields on PATCH requests", () => {
    // bb-fork(thread-start-ref): a pinned commit parses and clears with null.
    expect(
      contract.updateEnvironmentRequestSchema.parse({
        startRef: "0123456789abcdef0123456789abcdef01234567",
      }),
    ).toEqual({ startRef: "0123456789abcdef0123456789abcdef01234567" });
    expect(
      contract.updateEnvironmentRequestSchema.parse({ startRef: null }),
    ).toEqual({ startRef: null });

    // bb-fork(quiet-reparent): the notice flag travels with the reparent.
    expect(
      contract.updateThreadRequestSchema.parse({
        parentThreadId: "thr_parent",
        ownershipNotice: false,
      }),
    ).toEqual({ parentThreadId: "thr_parent", ownershipNotice: false });

    // bb-fork(parent-mute): true mutes child->parent notifications, false unmutes.
    expect(
      contract.updateThreadRequestSchema.parse({
        parentNotificationsMuted: true,
      }),
    ).toEqual({ parentNotificationsMuted: true });
    expect(
      contract.updateThreadRequestSchema.parse({
        parentNotificationsMuted: false,
      }),
    ).toEqual({ parentNotificationsMuted: false });
  });

  it("accepts the fork fields on a pending thread list entry", () => {
    expect(
      contract.threadListResponseSchema.parse([
        {
          id: "thr_123",
          projectId: "proj_123",
          environmentId: null,
          providerId: "codex",
          model: "gpt-5",
          reasoningLevel: null,
          title: "Pending thread",
          titleFallback: "Pending thread",
          sectionId: null,
          status: "idle",
          parentThreadId: null,
          // bb-fork(parent-mute): default = parent notifications on
          parentNotificationsMutedAt: null,
          sourceThreadId: null,
          lifecycleOwnerThreadId: null,
          originKind: null,
          originPluginId: null,
          visibility: "visible",
          parentNotifications: "auto",
          archivedAt: null,
          pinnedAt: null,
          pinSortKey: null,
          deletedAt: null,
          lastReadAt: null,
          latestAttentionAt: 2,
          createdAt: 1,
          updatedAt: 2,
          runtime: {
            displayStatus: "idle",
          },
          activity: {
            activeWorkflowCount: 0,
            activeBackgroundAgentCount: 0,
            activeBackgroundCommandCount: 0,
            activePlanModeCount: 0,
          },
          hasPendingInteraction: true,
          environmentHostId: "host_123",
          environmentName: null,
          environmentBranchName: "bb/test",
          environmentPath: null,
          environmentProviderId: "git-worktree",
          environmentIsWorktree: true,
          environmentWorkspaceDisplayKind: "managed-worktree",
          queuedWork: "none",
        },
      ]),
    ).toMatchObject([
      {
        model: "gpt-5",
        reasoningLevel: null,
        parentNotificationsMutedAt: null,
      },
    ]);
  });

  // bb-fork(windows): UNC paths are valid project paths in the fork.
  it("accepts a UNC project source path", () => {
    expect(
      contract.updateProjectSourceRequestSchema.parse({
        type: "local_path",
        path: "\\\\server\\share\\bb",
      }),
    ).toEqual({ type: "local_path", path: "\\\\server\\share\\bb" });
  });

  it("accepts empty input for a child thread seed", () => {
    const parsed = createThreadRequestSchema.parse({
      projectId: "proj_123",
      providerId: "codex",
      origin: "app",
      input: [],
      environment: {
        type: "reuse",
        environmentId: "env_parent",
      },
      parentThreadId: "thr_parent",
    });
    expect(parsed.input).toEqual([]);
    expect(parsed.parentThreadId).toBe("thr_parent");
  });
});
