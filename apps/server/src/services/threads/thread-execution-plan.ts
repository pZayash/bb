import {
  getAppSettings,
  getEnvironment,
  getQueuedThreadStartMessage,
  getThread,
} from "@bb/db";
import {
  DEFAULT_SERVICE_TIER,
  providerServiceTierOptions,
  reconcilePermissionMode,
  reconcileServiceTier,
  resolveReasoningLevelCandidate,
  type CallerExecutionInputSource,
  type PermissionMode,
  type ReasoningLevel,
  type RecordedThreadExecutionOptions,
  type ResolvedThreadExecutionOptions,
  type ServiceTier,
  type ThreadExecutionSource,
  type Thread,
} from "@bb/domain";
import { ApiError } from "../../errors.js";
import type { AppDeps, WorkSessionDeps } from "../../types.js";
import type { ProviderRegistryService } from "../providers/provider-registry.js";
import {
  clampPermissionModeToHost,
  isHostPermissionCeilingConflictError,
  resolveEnvironmentHostId,
} from "../hosts/permission-ceiling.js";
import { projectCheckoutPathOnHost } from "../projects/project-workspace.js";
import { loadThreadExecutionDefaults } from "./project-execution-defaults.js";
import {
  normalizeRecordedPermissionMode,
  type ThreadExecutionDefaults,
} from "./thread-default-policy.js";
import { getLastExecutionOptions } from "./thread-events.js";
import { toThreadQueuedMessage } from "./thread-queued-messages.js";
import {
  getSupportedReasoningLevelsForProvider,
  loadCachedReasoningCatalogModel,
  loadLiveReasoningCatalogModel,
} from "./thread-reasoning-policy.js";

interface ExecutionPlanFieldInput<TValue> {
  source: CallerExecutionInputSource;
  value: TValue;
}

interface ExistingThreadExecutionInput {
  model?: ExecutionPlanFieldInput<string>;
  permissionMode?: ExecutionPlanFieldInput<PermissionMode>;
  reasoningLevel?: ExecutionPlanFieldInput<ReasoningLevel>;
  serviceTier?: ExecutionPlanFieldInput<ServiceTier>;
}

export interface ExistingThreadExecutionInputRequest {
  model?: string;
  permissionMode?: PermissionMode;
  reasoningLevel?: ReasoningLevel;
  serviceTier?: ServiceTier;
  executionInputSources?: ExistingThreadExecutionInputRequestSources;
}

interface ExistingThreadExecutionInputRequestSources {
  model?: CallerExecutionInputSource;
  permissionMode?: CallerExecutionInputSource;
  reasoningLevel?: CallerExecutionInputSource;
  serviceTier?: CallerExecutionInputSource;
}

interface ResolveExistingThreadExecutionPlanArgs {
  defaultModel?: string;
  executionSource: ThreadExecutionSource;
  hostId?: string | null;
  input: ExistingThreadExecutionInput;
  threadId: string;
}

interface ResolveThreadPermissionModeArgs {
  defaults: ThreadExecutionDefaults;
  hostId: string | null;
  lastExecution: RecordedThreadExecutionOptions | null;
  requested?: ExecutionPlanFieldInput<PermissionMode>;
  thread: Thread;
}

interface ExistingThreadExecutionPlan {
  resolvedExecution: ResolvedThreadExecutionOptions;
}

function getStoredThreadExecutionOptions(
  deps: Pick<AppDeps, "db">,
  thread: Thread,
): RecordedThreadExecutionOptions | null {
  const lastExecution = getLastExecutionOptions(deps, thread.id);
  if (lastExecution !== null || thread.status !== "pending") {
    return lastExecution;
  }
  const queuedStart = getQueuedThreadStartMessage(deps.db, thread.id);
  if (queuedStart === null) return null;
  const queued = toThreadQueuedMessage(queuedStart);
  return {
    model: queued.model,
    reasoningLevel: queued.reasoningLevel,
    permissionMode: queued.permissionMode,
    serviceTier: queued.serviceTier,
    source: "client/turn/requested",
  };
}

function requireThread(deps: Pick<AppDeps, "db">, threadId: string) {
  const thread = getThread(deps.db, threadId);
  if (!thread) {
    throw new ApiError(404, "thread_not_found", "Thread not found");
  }
  return thread;
}

function resolveThreadPermissionMode(
  deps: Pick<AppDeps, "db" | "providerRegistry">,
  args: ResolveThreadPermissionModeArgs,
): PermissionMode {
  const permissionMode = clampPermissionModeToHost(deps, {
    hostId: args.hostId,
    permissionMode:
      args.requested?.value ??
      (args.lastExecution !== null
        ? normalizeRecordedPermissionMode(args.lastExecution.permissionMode)
        : args.defaults.permissionMode),
    providerId: args.thread.providerId,
  });
  const supported = deps.providerRegistry.getSupportedPermissionModes(
    args.thread.providerId,
  );
  if (!supported || supported.includes(permissionMode)) {
    return permissionMode;
  }
  if (args.requested?.source === "explicit") {
    throw new ProviderCapabilityValidationError(
      400,
      "invalid_request",
      `Provider ${args.thread.providerId} only supports ${supported.join(", ")} permission mode.`,
    );
  }
  return reconcilePermissionMode(permissionMode, supported);
}

export function resolveExistingThreadPermissionMode(
  deps: Pick<AppDeps, "db" | "providerRegistry">,
  threadId: string,
): PermissionMode {
  const thread = requireThread(deps, threadId);
  return resolveThreadPermissionMode(deps, {
    defaults: loadThreadExecutionDefaults(deps, thread),
    hostId: resolveEnvironmentHostId(deps, thread.environmentId),
    lastExecution: getStoredThreadExecutionOptions(deps, thread),
    thread,
  });
}

export function resolveThreadFallbackModel(
  deps: Pick<AppDeps, "db" | "providerRegistry">,
  thread: Thread,
): string | null {
  return (
    getStoredThreadExecutionOptions(deps, thread)?.model ??
    loadThreadExecutionDefaults(deps, thread).model
  );
}

function createMissingThreadExecutionModelError(threadId: string): ApiError {
  return new ApiError(
    500,
    "internal_error",
    `Thread ${threadId} has no stored execution model`,
  );
}

class ProviderCapabilityValidationError extends ApiError {}

function isMissingThreadExecutionModelError(
  error: unknown,
  threadId: string,
): boolean {
  return (
    error instanceof ApiError &&
    error.body.code === "internal_error" &&
    error.body.message === `Thread ${threadId} has no stored execution model`
  );
}

function isProviderCapabilityValidationError(
  error: unknown,
): error is ProviderCapabilityValidationError {
  return error instanceof ProviderCapabilityValidationError;
}

function hasExecutionInput(input: ExistingThreadExecutionInput): boolean {
  return (
    input.model !== undefined ||
    input.permissionMode !== undefined ||
    input.reasoningLevel !== undefined ||
    input.serviceTier !== undefined
  );
}

function toRequestInputField<TValue>(
  value: TValue | undefined,
  source: CallerExecutionInputSource | undefined,
): ExecutionPlanFieldInput<TValue> | undefined {
  if (value === undefined || source === undefined) {
    return undefined;
  }
  return { source, value };
}

function resolveRequestInputSource(
  sources: ExistingThreadExecutionInputRequestSources | undefined,
  field: keyof ExistingThreadExecutionInputRequestSources,
): CallerExecutionInputSource | undefined {
  if (sources === undefined) {
    return "explicit";
  }
  return sources[field];
}

export function buildExistingThreadExecutionInput(
  request: ExistingThreadExecutionInputRequest,
): ExistingThreadExecutionInput {
  const sources = request.executionInputSources;
  const model = toRequestInputField(
    request.model,
    resolveRequestInputSource(sources, "model"),
  );
  const serviceTier = toRequestInputField(
    request.serviceTier,
    resolveRequestInputSource(sources, "serviceTier"),
  );
  const reasoningLevel = toRequestInputField(
    request.reasoningLevel,
    resolveRequestInputSource(sources, "reasoningLevel"),
  );
  const permissionMode = toRequestInputField(
    request.permissionMode,
    resolveRequestInputSource(sources, "permissionMode"),
  );
  return {
    ...(model ? { model } : {}),
    ...(serviceTier ? { serviceTier } : {}),
    ...(reasoningLevel ? { reasoningLevel } : {}),
    ...(permissionMode ? { permissionMode } : {}),
  };
}

interface ResolvePlanReasoningLevelArgs {
  candidate: ReasoningLevel;
  explicit: boolean;
  hostId: string | null;
  model: string;
  providerId: string;
  workspacePaths: readonly string[];
}

async function resolvePlanReasoningLevel(
  deps: WorkSessionDeps,
  args: ResolvePlanReasoningLevelArgs,
): Promise<ReasoningLevel> {
  const catalogArgs = {
    hostId: args.hostId,
    model: args.model,
    providerId: args.providerId,
    workspacePaths: args.workspacePaths,
  };
  const declared = getSupportedReasoningLevelsForProvider(
    deps.providerRegistry,
    args.providerId,
  );
  let resolution = resolveReasoningLevelCandidate({
    candidate: args.candidate,
    declared,
    model: loadCachedReasoningCatalogModel(deps, catalogArgs),
  });
  if (resolution.candidateSupported || !args.explicit) {
    return resolution.level;
  }
  const liveModel = await loadLiveReasoningCatalogModel(deps, catalogArgs);
  if (liveModel !== null) {
    resolution = resolveReasoningLevelCandidate({
      candidate: args.candidate,
      declared,
      model: liveModel,
    });
    if (resolution.candidateSupported) {
      return resolution.level;
    }
  }
  throw new ProviderCapabilityValidationError(
    400,
    "invalid_request",
    resolution.support.source === "model"
      ? `Model ${args.model} on provider ${args.providerId} does not support ${args.candidate} reasoning level. Supported reasoning levels: ${resolution.support.levels.join(", ")}.`
      : `Provider ${args.providerId} does not support ${args.candidate} reasoning level. Supported reasoning levels: ${resolution.support.levels.join(", ")}.`,
  );
}

function resolveProviderServiceTier(
  registry: ProviderRegistryService,
  args: {
    providerId: string;
    requested: ExecutionPlanFieldInput<ServiceTier> | undefined;
    inherited: ServiceTier;
  },
): ServiceTier {
  const provider = registry.get(args.providerId);
  const candidate = args.requested?.value ?? args.inherited;
  if (candidate === DEFAULT_SERVICE_TIER) {
    return DEFAULT_SERVICE_TIER;
  }
  if (provider === null) {
    return candidate;
  }
  const supported = providerServiceTierOptions(provider.info);
  const reconciled = reconcileServiceTier(candidate, supported);
  if (reconciled === candidate || args.requested?.source !== "explicit") {
    return reconciled;
  }

  throw new ProviderCapabilityValidationError(
    400,
    "invalid_request",
    supported.length === 0
      ? `Provider ${args.providerId} does not support service tiers.`
      : `Provider ${args.providerId} does not support the ${candidate} service tier. Supported service tiers: ${[
          DEFAULT_SERVICE_TIER,
          ...supported.map((tier) => tier.id),
        ].join(", ")}.`,
  );
}

export async function resolveExistingThreadExecutionPlan(
  deps: WorkSessionDeps,
  args: ResolveExistingThreadExecutionPlanArgs,
): Promise<ExistingThreadExecutionPlan> {
  const thread = requireThread(deps, args.threadId);
  const lastExecution = getStoredThreadExecutionOptions(deps, thread);
  const defaults = loadThreadExecutionDefaults(deps, thread);
  const model =
    args.input.model?.value ??
    thread.modelOverride ??
    lastExecution?.model ??
    args.defaultModel ??
    defaults.model;
  if (!model) {
    throw createMissingThreadExecutionModelError(args.threadId);
  }

  const environment =
    thread.environmentId === null
      ? null
      : getEnvironment(deps.db, thread.environmentId);
  const hostId =
    args.hostId === undefined
      ? (environment?.hostId ?? null)
      : args.hostId;
  const checkoutPath =
    hostId === null
      ? undefined
      : projectCheckoutPathOnHost(deps, thread.projectId, hostId);
  const workspacePaths = [
    ...new Set(
      [environment?.path ?? undefined, checkoutPath].filter(
        (path): path is string => path !== undefined,
      ),
    ),
  ];

  const permissionMode = resolveThreadPermissionMode(deps, {
    defaults,
    hostId,
    lastExecution,
    ...(args.input.permissionMode !== undefined
      ? { requested: args.input.permissionMode }
      : {}),
    thread,
  });

  const reasoningCandidate =
    args.input.reasoningLevel?.value ??
    thread.reasoningLevelOverride ??
    lastExecution?.reasoningLevel ??
    defaults.reasoningLevel;
  const reasoningLevel = await resolvePlanReasoningLevel(deps, {
    candidate: reasoningCandidate,
    explicit: args.input.reasoningLevel?.source === "explicit",
    hostId,
    model,
    providerId: thread.providerId,
    workspacePaths,
  });

  const serviceTier = getAppSettings(deps.db).allowFastServiceTier
    ? resolveProviderServiceTier(deps.providerRegistry, {
        providerId: thread.providerId,
        requested: args.input.serviceTier,
        inherited: lastExecution?.serviceTier ?? defaults.serviceTier,
      })
    : DEFAULT_SERVICE_TIER;

  const resolvedExecution = {
    model,
    permissionMode,
    reasoningLevel,
    serviceTier,
    source: args.executionSource,
  };
  return {
    resolvedExecution,
  };
}

export async function tryResolveExistingThreadExecutionPlan(
  deps: WorkSessionDeps,
  args: ResolveExistingThreadExecutionPlanArgs,
): Promise<ExistingThreadExecutionPlan | null> {
  try {
    return await resolveExistingThreadExecutionPlan(deps, args);
  } catch (error) {
    if (isMissingThreadExecutionModelError(error, args.threadId)) {
      return null;
    }
    if (
      !hasExecutionInput(args.input) &&
      (isProviderCapabilityValidationError(error) ||
        isHostPermissionCeilingConflictError(error))
    ) {
      return null;
    }
    throw error;
  }
}
