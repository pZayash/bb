// bb-fork(windows): fork-owned coverage for claiming a Windows absolute
// workspace path during provider environment creation.
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import {
  environments,
  getEnvironment,
  getPreparingEnvironment,
  getThread,
} from "@bb/db";
import { recordProvisionedEnvironmentWorkspace } from "@bb/db/internal-environment-lifecycle";
import { makeHost } from "@bb/test-helpers/domain-fixtures";
import type { PluginEnvironmentProviderDeclaration } from "@get-bb/plugin-sdk";
import { validatePluginEnvironmentProviderDeclaration } from "@get-bb/plugin-sdk/internal/host-policy";
import { prepareProviderEnvironment } from "../../../src/services/threads/thread-environment-placement.js";
import {
  markProviderEnvironmentAttached,
  type ProviderOperationContext,
} from "../../../src/services/environments/environment-engine.js";
import { setPluginEnvironmentProviderBridge } from "../../../src/services/plugins/plugin-environment-provider-registry.js";
import { toThreadResponseFromThread } from "../../../src/services/threads/thread-runtime-display.js";
import {
  seedHostSession,
  seedProjectWithSource,
  seedThread,
} from "../../helpers/seed.js";
import {
  withTestHarness,
  type TestAppHarness,
} from "../../helpers/test-app.js";

function setup(
  harness: TestAppHarness,
  overrides: Partial<PluginEnvironmentProviderDeclaration> = {},
) {
  const { host, session } = seedHostSession(harness.deps, { id: "host_test" });
  const { project, source } = seedProjectWithSource(harness.deps, {
    hostId: host.id,
    path: "/tmp/project",
  });
  const thread = seedThread(harness.deps, {
    projectId: project.id,
    status: "starting",
  });
  const record = {
    pluginId: "test",
    provider: validatePluginEnvironmentProviderDeclaration({
      id: "test-provider",
      displayName: "Test",
      description: "Prepare a workspace for this thread.",
      icon: "Folder",
      create: async () => ({
        status: "created",
        path: `/tmp/${thread.id}`,
        ownsPath: true,
      }),
      remove: async () => ({ status: "removed" }),
      ...overrides,
    }),
  };
  setPluginEnvironmentProviderBridge({
    listEnvironmentProviders: () => [record],
    getEnvironmentProvider: (id) =>
      id === record.provider.id ? record : undefined,
    invokeProvider: async (_id, _label, run) => ({
      ok: true,
      value: await run(),
    }),
    decisionTimeoutMs: 10_000,
  });
  const context: ProviderOperationContext = {
    thread: toThreadResponseFromThread(harness.deps, { thread }),
    project,
    host: makeHost({ id: host.id, name: host.name }),
    machine: { type: "existing", hostId: host.id },
    projectCheckout: null,
    gitRemote: null,
    inputs: null,
    suggestedBranchName: "bb/test",
    environment: null,
  };
  let lastEnvironmentId: string | null = null;
  const row = () => {
    const attachedId = getThread(harness.db, thread.id)?.environmentId;
    const value =
      getPreparingEnvironment(harness.db, thread.id) ??
      (attachedId
        ? getEnvironment(harness.db, attachedId)
        : lastEnvironmentId === null
          ? null
          : getEnvironment(harness.db, lastEnvironmentId));
    if (value === null) throw new Error("Missing preparing environment");
    lastEnvironmentId = value.id;
    return value;
  };
  const ask = () => prepareProviderEnvironment(harness.deps, record, context);
  const settled = async () =>
    expect.poll(() => row().status).not.toBe("creating");
  const attach = () => {
    const prepared = row();
    if (prepared.hostId === null || prepared.path === null) {
      throw new Error("Environment is not ready");
    }
    const environment = getEnvironment(harness.db, prepared.id)!;
    harness.db
      .update(environments)
      .set({ status: "ready" })
      .where(eq(environments.id, environment.id))
      .run();
    markProviderEnvironmentAttached(harness.db, thread.id, environment.id);
    recordProvisionedEnvironmentWorkspace(
      harness.db,
      harness.hub,
      environment.id,
      {
        path: prepared.path,
        isGitRepo: false,
        isWorktree: false,
        branchName: null,
        defaultBranch: null,
      },
    );
    return environment.id;
  };
  return {
    ask,
    attach,
    context,
    host,
    session,
    record,
    row,
    settled,
    source,
    thread,
  };
}

it("claims a Windows absolute workspace path", async () =>
  withTestHarness(async (harness) => {
    const fixture = setup(harness, {
      create: async (context) => {
        expect(
          await context.experimental_claimPath("C:/Users/tester/project"),
        ).toBe(true);
        return {
          status: "created",
          path: "C:/Users/tester/project",
          ownsPath: false,
        };
      },
    });
    fixture.ask();
    await fixture.settled();
    expect(fixture.row().path).toBe("C:\\Users\\tester\\project");
    expect(["provisioning", "ready"]).toContain(fixture.row().status);
  }));
