import {
  getAppSettings,
  setAppSettings,
  setThreadExecutionOverride,
  updateHost,
  upsertProjectExecutionDefaults,
} from "@bb/db";
import type {
  PermissionMode,
  ReasoningLevel,
  RecordedPermissionMode,
} from "@bb/domain";
import { describe, expect, it } from "vitest";
import {
  buildExistingThreadExecutionInput,
  resolveExistingThreadExecutionPlan,
  resolveExistingThreadPermissionMode,
  tryResolveExistingThreadExecutionPlan,
} from "../../../src/services/threads/thread-execution-plan.js";
import { resolveProjectExecutionDefaultsForCreate } from "../../../src/services/threads/project-execution-defaults.js";
import { availableModelFixture } from "../../helpers/available-models.js";
import { seedModelCatalog } from "../../helpers/provider-model-catalogs.js";
import { minimalProviderRegistration } from "../../helpers/provider-registry.js";
import {
  seedEnvironment,
  seedHostSession,
  seedProjectWithSource,
  seedThread,
  seedThreadRuntimeState,
} from "../../helpers/seed.js";
import {
  withTestHarness,
  type TestAppHarness,
} from "../../helpers/test-app.js";

describe("thread execution plan input sources", () => {
  it("uses the default tier for explicit and inherited fast selections when fast is disabled", async () => {
    await withTestHarness(async (harness) => {
      const { host } = seedHostSession(harness.deps, {
        id: "host-fast-tier-setting",
      });
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
        providerId: "codex",
      });
      upsertProjectExecutionDefaults(harness.deps.db, {
        projectId: project.id,
        providerId: "codex",
        model: "gpt-5",
        reasoningLevel: "medium",
        permissionMode: "auto",
        serviceTier: "fast",
      });
      const resolve = (
        input: ReturnType<typeof buildExistingThreadExecutionInput>,
      ) =>
        resolveExistingThreadExecutionPlan(harness.deps, {
          executionSource: "client/turn/requested",
          input,
          threadId: thread.id,
        });

      expect((await resolve({})).resolvedExecution.serviceTier).toBe("fast");
      setAppSettings(harness.db, {
        ...getAppSettings(harness.db),
        allowFastServiceTier: false,
      });
      expect((await resolve({})).resolvedExecution.serviceTier).toBe("default");
      expect(
        (await resolve({ serviceTier: { source: "explicit", value: "fast" } }))
          .resolvedExecution.serviceTier,
      ).toBe("default");
      setAppSettings(harness.db, {
        ...getAppSettings(harness.db),
        allowFastServiceTier: true,
      });
      expect((await resolve({})).resolvedExecution.serviceTier).toBe("fast");
    });
  });

  it("accepts the tiers a provider lists and rejects an explicit tier it does not", async () => {
    await withTestHarness(async (harness) => {
      const { host } = seedHostSession(harness.deps, {
        id: "host-open-tier",
      });
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
        providerId: "codex",
      });
      upsertProjectExecutionDefaults(harness.deps.db, {
        projectId: project.id,
        providerId: "codex",
        model: "gpt-5",
        reasoningLevel: "medium",
        permissionMode: "auto",
        serviceTier: "turbo",
      });
      const resolve = (
        input: ReturnType<typeof buildExistingThreadExecutionInput>,
      ) =>
        resolveExistingThreadExecutionPlan(harness.deps, {
          executionSource: "client/turn/requested",
          input,
          threadId: thread.id,
        });

      expect((await resolve({})).resolvedExecution.serviceTier).toBe("default");
      expect(
        (
          await resolve({
            serviceTier: { source: "explicit", value: "ultrafast" },
          })
        ).resolvedExecution.serviceTier,
      ).toBe("ultrafast");
      expect(
        (
          await resolve({
            serviceTier: { source: "client-preference", value: "turbo" },
          })
        ).resolvedExecution.serviceTier,
      ).toBe("default");
      await expect(
        resolve({ serviceTier: { source: "explicit", value: "turbo" } }),
      ).rejects.toMatchObject({
        status: 400,
        body: {
          code: "invalid_request",
          message:
            "Provider codex does not support the turbo service tier. Supported service tiers: default, fast, ultrafast.",
        },
      });
    });
  });

  it("runs a provider without service tiers at the default tier unless a tier is explicitly requested", async () => {
    await withTestHarness(async (harness) => {
      const { host } = seedHostSession(harness.deps, {
        id: "host-no-tier",
      });
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
        providerId: "pi",
      });
      upsertProjectExecutionDefaults(harness.deps.db, {
        projectId: project.id,
        providerId: "pi",
        model: "pi-model",
        reasoningLevel: "medium",
        permissionMode: "full",
        serviceTier: "fast",
      });
      const resolve = (
        input: ReturnType<typeof buildExistingThreadExecutionInput>,
      ) =>
        resolveExistingThreadExecutionPlan(harness.deps, {
          executionSource: "client/turn/requested",
          input,
          threadId: thread.id,
        });

      expect((await resolve({})).resolvedExecution.serviceTier).toBe("default");
      await expect(
        resolve({ serviceTier: { source: "explicit", value: "fast" } }),
      ).rejects.toMatchObject({
        status: 400,
        body: { message: "Provider pi does not support service tiers." },
      });
    });
  });

  it("treats supplied execution fields as explicit when legacy callers omit sources", () => {
    expect(
      buildExistingThreadExecutionInput({
        model: "gpt-5",
        permissionMode: "accept-edits",
        reasoningLevel: "high",
        serviceTier: "fast",
      }),
    ).toEqual({
      model: { source: "explicit", value: "gpt-5" },
      permissionMode: { source: "explicit", value: "accept-edits" },
      reasoningLevel: { source: "explicit", value: "high" },
      serviceTier: { source: "explicit", value: "fast" },
    });
  });

  it("ignores displayed-only values when new callers provide empty source metadata", () => {
    expect(
      buildExistingThreadExecutionInput({
        model: "gpt-5",
        permissionMode: "accept-edits",
        reasoningLevel: "high",
        serviceTier: "fast",
        executionInputSources: {},
      }),
    ).toEqual({});
  });

  it("keeps caller-owned source metadata on supplied execution fields", () => {
    expect(
      buildExistingThreadExecutionInput({
        model: "gpt-5",
        permissionMode: "accept-edits",
        reasoningLevel: "high",
        serviceTier: "fast",
        executionInputSources: {
          model: "client-preference",
          permissionMode: "explicit",
          reasoningLevel: "client-preference",
          serviceTier: "explicit",
        },
      }),
    ).toEqual({
      model: { source: "client-preference", value: "gpt-5" },
      permissionMode: { source: "explicit", value: "accept-edits" },
      reasoningLevel: { source: "client-preference", value: "high" },
      serviceTier: { source: "explicit", value: "fast" },
    });
  });

  it("uses source metadata before resolving create provider defaults", async () => {
    await withTestHarness(async (harness) => {
      const { host } = seedHostSession(harness.deps, {
        id: "host-source-aware-create-defaults",
      });
      const { project } = seedProjectWithSource(harness.deps, {
        hostId: host.id,
      });
      upsertProjectExecutionDefaults(harness.deps.db, {
        projectId: project.id,
        providerId: "codex",
        model: "gpt-5",
        reasoningLevel: "medium",
        permissionMode: "auto",
        serviceTier: "default",
      });

      const ignoredDisplayedValue = resolveProjectExecutionDefaultsForCreate(
        harness.deps,
        {
          executionInputSources: {},
          model: "openai-codex/gpt-5.4",
          parentThread: null,
          projectId: project.id,
          providerId: "pi",
        },
      );
      const legacyExplicitValue = resolveProjectExecutionDefaultsForCreate(
        harness.deps,
        {
          model: "openai-codex/gpt-5.4",
          parentThread: null,
          projectId: project.id,
          providerId: "pi",
        },
      );
      const clientPreferredProvider = resolveProjectExecutionDefaultsForCreate(
        harness.deps,
        {
          executionInputSources: { providerId: "client-preference" },
          model: "openai-codex/gpt-5.4",
          parentThread: null,
          projectId: project.id,
          providerId: "pi",
        },
      );

      expect(ignoredDisplayedValue.providerId).toBe("codex");
      expect(ignoredDisplayedValue.defaultModel).toBe("gpt-5");
      expect(legacyExplicitValue.providerId).toBe("pi");
      expect(legacyExplicitValue.defaultModel).toBeNull();
      expect(clientPreferredProvider.providerId).toBe("pi");
      expect(clientPreferredProvider.defaultModel).toBeNull();
      expect(clientPreferredProvider.requestedModel).toBeNull();
    });
  });

  it("uses the product provider when create metadata has no caller-owned provider or model", async () => {
    await withTestHarness(async (harness) => {
      const { host } = seedHostSession(harness.deps, {
        id: "host-source-aware-standard-product-defaults",
      });
      const { project } = seedProjectWithSource(harness.deps, {
        hostId: host.id,
      });

      const resolution = resolveProjectExecutionDefaultsForCreate(
        harness.deps,
        {
          executionInputSources: {},
          model: "openai-codex/gpt-5.4",
          parentThread: null,
          projectId: project.id,
          providerId: "pi",
        },
      );

      expect(resolution.providerId).toBe("codex");
      expect(resolution.defaultModel).toBeNull();
      expect(resolution.requestedModel).toBeNull();
    });
  });
});
describe("machine permission ceiling", () => {
  async function seedCappedThread(
    harness: TestAppHarness,
    args: { maxPermissionMode: PermissionMode; providerId: string; id: string },
  ) {
    const { host } = seedHostSession(harness.deps, { id: args.id });
    updateHost(harness.db, harness.hub, host.id, {
      maxPermissionMode: args.maxPermissionMode,
    });
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
      providerId: args.providerId,
    });
    seedThreadRuntimeState(harness.deps, {
      environmentId: environment.id,
      permissionMode: "full",
      providerThreadId: `provider-${args.id}`,
      threadId: thread.id,
    });
    return thread;
  }

  it("clamps an explicitly requested mode down to the machine's ceiling", async () => {
    await withTestHarness(async (harness) => {
      const thread = await seedCappedThread(harness, {
        id: "host-ceiling-explicit",
        maxPermissionMode: "auto",
        providerId: "codex",
      });

      const plan = await resolveExistingThreadExecutionPlan(harness.deps, {
        executionSource: "client/turn/requested",
        input: { permissionMode: { source: "explicit", value: "full" } },
        threadId: thread.id,
      });

      expect(plan.resolvedExecution.permissionMode).toBe("auto");
      expect(resolveExistingThreadPermissionMode(harness.deps, thread.id)).toBe(
        "auto",
      );
    });
  });

  it("falls back to the highest supported mode under the ceiling", async () => {
    await withTestHarness(async (harness) => {
      const thread = await seedCappedThread(harness, {
        id: "host-ceiling-acp",
        maxPermissionMode: "auto",
        providerId: "acp-cursor",
      });

      const plan = await resolveExistingThreadExecutionPlan(harness.deps, {
        executionSource: "client/turn/requested",
        input: { permissionMode: { source: "explicit", value: "full" } },
        threadId: thread.id,
      });

      expect(plan.resolvedExecution.permissionMode).toBe("accept-edits");
    });
  });

  it("reads as no default execution options instead of failing the page", async () => {
    await withTestHarness(async (harness) => {
      const thread = await seedCappedThread(harness, {
        id: "host-ceiling-pi-read",
        maxPermissionMode: "accept-edits",
        providerId: "pi",
      });

      await expect(
        tryResolveExistingThreadExecutionPlan(harness.deps, {
          executionSource: "client/turn/requested",
          input: {},
          threadId: thread.id,
        }),
      ).resolves.toBeNull();
    });
  });

  it("refuses a provider that cannot run under the ceiling", async () => {
    await withTestHarness(async (harness) => {
      const thread = await seedCappedThread(harness, {
        id: "host-ceiling-pi",
        maxPermissionMode: "accept-edits",
        providerId: "pi",
      });

      await expect(
        resolveExistingThreadExecutionPlan(harness.deps, {
          executionSource: "client/turn/requested",
          input: {},
          threadId: thread.id,
        }),
      ).rejects.toMatchObject({
        body: { code: "host_permission_ceiling_conflict" },
      });
    });
  });

  it("leaves work alone on an uncapped machine", async () => {
    await withTestHarness(async (harness) => {
      const thread = await seedCappedThread(harness, {
        id: "host-ceiling-none",
        maxPermissionMode: "full",
        providerId: "codex",
      });

      const plan = await resolveExistingThreadExecutionPlan(harness.deps, {
        executionSource: "client/turn/requested",
        input: {},
        threadId: thread.id,
      });

      expect(plan.resolvedExecution.permissionMode).toBe("full");
    });
  });
});

const NARROW_PROVIDER_INFO = {
  pluginId: "provider-acp",
  available: true,
  maintenance: { health: false, usage: false, installation: false },
  capabilities: {
    supportsThreadArchive: false,
    supportsThreadRename: false,
    supportsServiceTier: false,
    supportsNativeUserQuestion: false,
    supportsFork: false,
    supportsSessionRewind: false,
    supportsManualCompaction: false,
    modelCatalogScope: "host" as const,
    permissionModes: ["accept-edits", "full"] as PermissionMode[],
  },
  composerActions: [],
  completedTurnDisplay: "collapse" as const,
  displayName: "Narrow",
  id: "narrow",
  logoUrl: null,
};

describe("provider capability reconciliation", () => {
  function registerProvider(
    harness: TestAppHarness,
    args: {
      id: string;
      permissionModes: readonly PermissionMode[];
      reasoningLevels: readonly ReasoningLevel[];
    },
  ) {
    harness.deps.providerRegistry.register(
      minimalProviderRegistration({
        pluginId: "provider-acp",
        info: {
          ...NARROW_PROVIDER_INFO,
          id: args.id,
          capabilities: {
            ...NARROW_PROVIDER_INFO.capabilities,
            permissionModes: [...args.permissionModes],
          },
        },
        serverCapabilities: {
          fork: "none",
          reasoningLevels: args.reasoningLevels,
          supportsManualCompaction: false,
        },
      }),
    );
  }

  function seedProviderThread(
    harness: TestAppHarness,
    args: {
      hostId: string;
      permissionMode?: RecordedPermissionMode;
      providerId: string;
      reasoningLevel?: ReasoningLevel;
      reasoningLevelOverride?: ReasoningLevel;
    },
  ) {
    const { host } = seedHostSession(harness.deps, { id: args.hostId });
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
      providerId: args.providerId,
    });
    seedThreadRuntimeState(harness.deps, {
      environmentId: environment.id,
      model: `${args.providerId}-model`,
      permissionMode: args.permissionMode ?? "full",
      providerThreadId: `provider-${args.hostId}`,
      reasoningLevel: args.reasoningLevel ?? "low",
      threadId: thread.id,
    });
    if (args.reasoningLevelOverride !== undefined) {
      setThreadExecutionOverride(harness.db, {
        threadId: thread.id,
        modelOverride: null,
        reasoningLevelOverride: args.reasoningLevelOverride,
      });
    }
    return thread;
  }

  function resolveThreadPlan(harness: TestAppHarness, threadId: string) {
    return (input: ReturnType<typeof buildExistingThreadExecutionInput>) =>
      resolveExistingThreadExecutionPlan(harness.deps, {
        executionSource: "client/turn/requested",
        input,
        threadId,
      });
  }

  it("reconciles an inherited reasoning level the provider does not support", async () => {
    await withTestHarness(async (harness) => {
      registerProvider(harness, {
        id: "narrow",
        permissionModes: ["accept-edits", "full"],
        reasoningLevels: ["low", "high"],
      });
      const thread = seedProviderThread(harness, {
        hostId: "host-inherited-reasoning",
        permissionMode: "full",
        providerId: "narrow",
        reasoningLevel: "xhigh",
      });

      const plan = await resolveThreadPlan(harness, thread.id)({});

      expect(plan.resolvedExecution.reasoningLevel).toBe("high");
    });
  });

  it("reconciles a stale client-preference reasoning level", async () => {
    await withTestHarness(async (harness) => {
      registerProvider(harness, {
        id: "narrow",
        permissionModes: ["accept-edits", "full"],
        reasoningLevels: ["low", "high"],
      });
      const thread = seedProviderThread(harness, {
        hostId: "host-stale-client-preference",
        providerId: "narrow",
      });

      const plan = await resolveThreadPlan(
        harness,
        thread.id,
      )({
        reasoningLevel: { source: "client-preference", value: "xhigh" },
      });

      expect(plan.resolvedExecution.reasoningLevel).toBe("high");
    });
  });

  it("rejects an explicit reasoning level missing from the merged list", async () => {
    await withTestHarness(async (harness) => {
      registerProvider(harness, {
        id: "narrow",
        permissionModes: ["accept-edits", "full"],
        reasoningLevels: ["low", "high"],
      });
      const thread = seedProviderThread(harness, {
        hostId: "host-explicit-unsupported",
        providerId: "narrow",
      });

      await expect(
        resolveThreadPlan(
          harness,
          thread.id,
        )({ reasoningLevel: { source: "explicit", value: "xhigh" } }),
      ).rejects.toMatchObject({
        status: 400,
        body: {
          code: "invalid_request",
          message:
            "Provider narrow does not support xhigh reasoning level. Supported reasoning levels: low, high.",
        },
      });
    });
  });

  it("rejects an explicit provider-specific level missing from the merged list", async () => {
    await withTestHarness(async (harness) => {
      registerProvider(harness, {
        id: "narrow",
        permissionModes: ["accept-edits", "full"],
        reasoningLevels: ["low", "high"],
      });
      const thread = seedProviderThread(harness, {
        hostId: "host-explicit-custom-level",
        providerId: "narrow",
      });

      await expect(
        resolveThreadPlan(
          harness,
          thread.id,
        )({ reasoningLevel: { source: "explicit", value: "deep-think" } }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  it("accepts an explicit level the model catalog reports but the declaration lacks", async () => {
    await withTestHarness(async (harness) => {
      const { host } = seedHostSession(harness.deps, {
        id: "host-catalog-level",
      });
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
        providerId: "codex",
      });
      await seedModelCatalog(harness, {
        hostId: host.id,
        providerId: "codex",
        models: [
          availableModelFixture({
            model: "gpt-5.4",
            reasoningLevels: ["deep-think"],
          }),
        ],
      });

      const plan = await resolveThreadPlan(
        harness,
        thread.id,
      )({
        model: { source: "explicit", value: "gpt-5.4" },
        reasoningLevel: { source: "explicit", value: "deep-think" },
      });

      expect(plan.resolvedExecution.reasoningLevel).toBe("deep-think");
    });
  });

  it("reconciles a stale stored reasoning level override at turn time", async () => {
    await withTestHarness(async (harness) => {
      registerProvider(harness, {
        id: "narrow",
        permissionModes: ["accept-edits", "full"],
        reasoningLevels: ["low", "high"],
      });
      const thread = seedProviderThread(harness, {
        hostId: "host-stale-override",
        providerId: "narrow",
        reasoningLevelOverride: "xhigh",
      });

      const plan = await resolveThreadPlan(harness, thread.id)({});

      expect(plan.resolvedExecution.reasoningLevel).toBe("high");
    });
  });


  it("passes the level through when neither catalog nor declaration knows the ladder", async () => {
    await withTestHarness(async (harness) => {
      registerProvider(harness, {
        id: "opaque",
        permissionModes: ["full"],
        reasoningLevels: [],
      });
      const thread = seedProviderThread(harness, {
        hostId: "host-opaque-ladder",
        permissionMode: "full",
        providerId: "opaque",
        reasoningLevel: "medium",
      });

      const plan = await resolveThreadPlan(harness, thread.id)({});

      expect(plan.resolvedExecution.reasoningLevel).toBe("medium");
    });
  });

  it("reconciles an inherited auto permission mode down to the provider's highest lower mode", async () => {
    await withTestHarness(async (harness) => {
      registerProvider(harness, {
        id: "narrow",
        permissionModes: ["accept-edits", "full"],
        reasoningLevels: ["low", "high"],
      });
      const thread = seedProviderThread(harness, {
        hostId: "host-inherited-auto",
        permissionMode: "auto",
        providerId: "narrow",
        reasoningLevel: "low",
      });

      const plan = await resolveThreadPlan(harness, thread.id)({});

      expect(plan.resolvedExecution.permissionMode).toBe("accept-edits");
    });
  });

  it("rejects an explicit permission mode the provider does not support", async () => {
    await withTestHarness(async (harness) => {
      registerProvider(harness, {
        id: "narrow",
        permissionModes: ["accept-edits", "full"],
        reasoningLevels: ["low", "high"],
      });
      const thread = seedProviderThread(harness, {
        hostId: "host-explicit-mode",
        providerId: "narrow",
      });

      await expect(
        resolveThreadPlan(
          harness,
          thread.id,
        )({ permissionMode: { source: "explicit", value: "auto" } }),
      ).rejects.toMatchObject({
        status: 400,
        body: {
          code: "invalid_request",
          message:
            "Provider narrow only supports accept-edits, full permission mode.",
        },
      });
    });
  });

  it("returns a reconciled plan from tryResolve when inherited capabilities drifted", async () => {
    await withTestHarness(async (harness) => {
      registerProvider(harness, {
        id: "narrow",
        permissionModes: ["accept-edits", "full"],
        reasoningLevels: ["low", "high"],
      });
      const thread = seedProviderThread(harness, {
        hostId: "host-try-resolve",
        permissionMode: "full",
        providerId: "narrow",
        reasoningLevel: "xhigh",
      });

      const plan = await tryResolveExistingThreadExecutionPlan(harness.deps, {
        executionSource: "client/turn/requested",
        input: {},
        threadId: thread.id,
      });

      expect(plan?.resolvedExecution.reasoningLevel).toBe("high");
    });
  });
});
