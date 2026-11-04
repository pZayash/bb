import type {
  AvailableModel,
  ReasoningLevel,
} from "@bb/domain";
import type { AppDeps, WorkSessionDeps } from "../../types.js";
import type { ProviderRegistryService } from "../providers/provider-registry.js";

export function getSupportedReasoningLevelsForProvider(
  registry: ProviderRegistryService,
  providerId: string,
): readonly ReasoningLevel[] {
  return registry.getServerCapabilities(providerId)?.reasoningLevels ?? [];
}

export interface ReasoningCatalogModelArgs {
  hostId: string | null;
  model: string;
  providerId: string;
  workspacePaths: readonly string[];
}

export function loadCachedReasoningCatalogModel(
  deps: Pick<AppDeps, "db" | "lifecycleDedupers" | "providerRegistry">,
  args: ReasoningCatalogModelArgs,
): AvailableModel | null {
  if (args.hostId === null) {
    return null;
  }
  return deps.lifecycleDedupers.providerModelCatalogs.getCachedModel(deps, {
    hostId: args.hostId,
    model: args.model,
    providerId: args.providerId,
    workspacePaths: args.workspacePaths,
  });
}

export async function loadLiveReasoningCatalogModel(
  deps: WorkSessionDeps,
  args: ReasoningCatalogModelArgs,
): Promise<AvailableModel | null> {
  const provider = deps.providerRegistry.get(args.providerId)?.info;
  if (provider === undefined || args.hostId === null) {
    return null;
  }
  try {
    const result = await deps.lifecycleDedupers.providerModelCatalogs.read(
      deps,
      {
        access: {
          kind: "validation",
          requiredModel: args.model,
          selectedModel: args.model,
        },
        cwd: args.workspacePaths[0] ?? null,
        hostId: args.hostId,
        provider,
      },
    );
    if (result.kind !== "catalog") {
      return null;
    }
    return (
      [...result.models, ...result.selectedOnlyModels].find(
        (candidate) => candidate.model === args.model,
      ) ?? null
    );
  } catch {
    return null;
  }
}
