// bb-fork(windows): fork-owned coverage for resolving each list entry's model
// and reasoning level the way the next turn resolves them.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  appendStoredThreadEvent,
  createEnvironment,
  createProject,
  createThread,
  noopNotifier,
  upsertHost,
  upsertProjectExecutionDefaults,
  type DbConnection,
  type ThreadWithPendingInteractionState,
} from "@bb/db";
import { createMigratedConnection } from "@bb/db/testing";
import { formatClientTurnRequestIdSuffix, threadScope } from "@bb/domain";
import type { ClientTurnRequestId, PromptInput, Thread } from "@bb/domain";
import { toThreadListEntryResponses } from "../../../src/services/threads/thread-runtime-display.js";
import { NotificationHub } from "../../../src/ws/hub.js";
import { createTestProviderRegistry } from "../../helpers/provider-registry.js";

const providerRegistry = await createTestProviderRegistry();

interface SetupResult {
  db: DbConnection;
  hostId: string;
  hub: NotificationHub;
}

interface CreateThreadWithEnvironmentArgs {
  db: DbConnection;
  environmentProviderId?: string;
  hostId: string;
  providerId?: string;
  status?: Thread["status"];
}

interface ThreadWithPinSortKey extends Thread {
  pinSortKey: string | null;
}

interface CreateThreadListEntryArgs {
  environmentHostId: string | null;
  thread: ThreadWithPinSortKey;
}

function turnRequestData({
  input,
  requestId,
}: {
  input: PromptInput[];
  requestId: ClientTurnRequestId;
}) {
  return {
    direction: "outbound",
    source: "tell",
    initiator: "user",
    senderThreadId: null,
    requestId,
    input,
    target: { kind: "new-turn" },
    request: { method: "turn/start", params: {} },
    execution: {
      model: "gpt-5",
      reasoningLevel: "medium",
      permissionMode: "workspace-write",
      source: "client/turn/requested",
      serviceTier: "default",
    },
  } as const;
}

function setup(): SetupResult {
  const db = createMigratedConnection();
  const hub = new NotificationHub();
  const host = upsertHost(db, noopNotifier, {
    id: "host-runtime-display",
    name: "Runtime Display Host",
  });
  return { db, hostId: host.id, hub };
}

function createThreadWithEnvironment(args: CreateThreadWithEnvironmentArgs) {
  const suffix = randomUUID();
  const { project } = createProject(args.db, noopNotifier, {
    name: `Runtime Display Project ${suffix}`,
    source: {
      type: "local_path",
      hostId: args.hostId,
      path: `/tmp/${args.hostId}/project/${suffix}`,
    },
  });
  const environment = createEnvironment(args.db, noopNotifier, {
    providerOwnsPath: false,
    hostId: args.hostId,
    projectId: project.id,
    path: `/tmp/${args.hostId}/environment/${suffix}`,
    status: "ready",
    environmentProvider:
      args.environmentProviderId === undefined
        ? null
        : {
            environmentProviderId: args.environmentProviderId,
            instanceKey: null,
            selection: {
              machine: { type: "existing", hostId: args.hostId },
              inputs: null,
            },
          },
  });
  const thread = createThread(args.db, noopNotifier, {
    projectId: project.id,
    environmentId: environment.id,
    providerId: args.providerId ?? "codex",
    status: args.status ?? "active",
  });

  return { environment, project, thread };
}

function createThreadListEntry(
  args: CreateThreadListEntryArgs,
): ThreadWithPendingInteractionState {
  return {
    ...args.thread,
    modelOverride: null,
    reasoningLevelOverride: null,
    storageDeletedAt: null,
    statusChangedAt: args.thread.updatedAt,
    environmentBranchName: null,
    environmentPath: null,
    environmentStatus: null,
    environmentHostLifecycle: null,
    environmentProviderId: null,
    environmentIsWorktree: null,
    environmentHostId: args.environmentHostId,
    environmentName: null,
    hasPendingInteraction: false,
    startupContext: null,
  };
}

describe("thread runtime display", () => {
  it("resolves each list entry's model like its next turn would", () => {
    const { db, hostId, hub } = setup();
    const fromTurn = createThreadWithEnvironment({
      db,
      hostId,
      providerId: "codex",
    });
    const overridden = createThreadWithEnvironment({
      db,
      hostId,
      providerId: "codex",
    });
    const fromDefault = createThreadWithEnvironment({
      db,
      hostId,
      providerId: "codex",
    });
    const mismatched = createThreadWithEnvironment({
      db,
      hostId,
      providerId: "claude-code",
    });
    const bare = createThreadWithEnvironment({
      db,
      hostId,
      providerId: "claude-code",
    });

    appendStoredThreadEvent(db, noopNotifier, {
      threadId: fromTurn.thread.id,
      scope: threadScope(),
      type: "client/turn/requested",
      data: turnRequestData({
        input: [{ type: "text", text: "go", mentions: [] }],
        requestId: formatClientTurnRequestIdSuffix({ suffix: "23456789bb" }),
      }),
    });
    for (const project of [fromDefault.project, mismatched.project]) {
      upsertProjectExecutionDefaults(db, {
        projectId: project.id,
        providerId: "codex",
        model: "gpt-5-default",
        reasoningLevel: "medium",
        permissionMode: "auto",
        serviceTier: "default",
      });
    }

    const entries = toThreadListEntryResponses(
      { db, hub, providerRegistry },
      {
        now: 1_000,
        threads: [
          createThreadListEntry({
            environmentHostId: hostId,
            thread: fromTurn.thread,
          }),
          {
            ...createThreadListEntry({
              environmentHostId: hostId,
              thread: overridden.thread,
            }),
            modelOverride: "gpt-5-override",
          },
          createThreadListEntry({
            environmentHostId: hostId,
            thread: fromDefault.thread,
          }),
          createThreadListEntry({
            environmentHostId: hostId,
            thread: mismatched.thread,
          }),
          createThreadListEntry({
            environmentHostId: hostId,
            thread: bare.thread,
          }),
        ],
      },
    );

    expect(entries.map((entry) => entry.model)).toEqual([
      "gpt-5",
      "gpt-5-override",
      "gpt-5-default",
      null,
      null,
    ]);
  });

  it("resolves each list entry's reasoning level like its next turn would", () => {
    const { db, hostId, hub } = setup();
    const fromTurn = createThreadWithEnvironment({
      db,
      hostId,
      providerId: "codex",
    });
    const overridden = createThreadWithEnvironment({
      db,
      hostId,
      providerId: "codex",
    });
    const fromDefault = createThreadWithEnvironment({
      db,
      hostId,
      providerId: "codex",
    });
    const mismatched = createThreadWithEnvironment({
      db,
      hostId,
      providerId: "claude-code",
    });
    const bare = createThreadWithEnvironment({
      db,
      hostId,
      providerId: "claude-code",
    });

    appendStoredThreadEvent(db, noopNotifier, {
      threadId: fromTurn.thread.id,
      scope: threadScope(),
      type: "client/turn/requested",
      data: turnRequestData({
        input: [{ type: "text", text: "go", mentions: [] }],
        requestId: formatClientTurnRequestIdSuffix({ suffix: "23456789cc" }),
      }),
    });
    for (const project of [fromDefault.project, mismatched.project]) {
      upsertProjectExecutionDefaults(db, {
        projectId: project.id,
        providerId: "codex",
        model: "gpt-5-default",
        reasoningLevel: "xhigh",
        permissionMode: "auto",
        serviceTier: "default",
      });
    }

    const entries = toThreadListEntryResponses(
      { db, hub, providerRegistry },
      {
        now: 1_000,
        threads: [
          createThreadListEntry({
            environmentHostId: hostId,
            thread: fromTurn.thread,
          }),
          {
            ...createThreadListEntry({
              environmentHostId: hostId,
              thread: overridden.thread,
            }),
            reasoningLevelOverride: "ultra",
          },
          createThreadListEntry({
            environmentHostId: hostId,
            thread: fromDefault.thread,
          }),
          createThreadListEntry({
            environmentHostId: hostId,
            thread: mismatched.thread,
          }),
          createThreadListEntry({
            environmentHostId: hostId,
            thread: bare.thread,
          }),
        ],
      },
    );

    expect(entries.map((entry) => entry.reasoningLevel)).toEqual([
      "medium",
      "ultra",
      "xhigh",
      null,
      null,
    ]);
  });
});
