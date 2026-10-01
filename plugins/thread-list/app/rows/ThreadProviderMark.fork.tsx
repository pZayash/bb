// bb-fork(windows): fork-local sidebar decoration; the provider mark and the model line under a thread title.
import { useMemo, type MouseEvent } from "react";
import {
  experimental_ProviderIcon as ProviderIcon,
  experimental_useProviders,
  type PluginProvidersState,
} from "@get-bb/plugin-sdk/app";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type ThreadProvider = PluginProvidersState["providers"][number];

export const SIDEBAR_MODEL_ROW_HEIGHT_CLASS =
  "min-h-9 max-md:pointer-coarse:min-h-10 [--bb-sidebar-sticky-tier-height:auto]! [--bb-sidebar-sticky-parent-stride:2.5rem] max-md:pointer-coarse:[--bb-sidebar-sticky-parent-stride:2.75rem]";

const providerByIdCache = new WeakMap<
  PluginProvidersState["providers"],
  ReadonlyMap<string, ThreadProvider>
>();

function providerById(
  providers: PluginProvidersState["providers"],
): ReadonlyMap<string, ThreadProvider> {
  const cached = providerByIdCache.get(providers);
  if (cached !== undefined) return cached;
  const map = new Map(
    providers.map((provider) => [provider.id, provider] as const),
  );
  providerByIdCache.set(providers, map);
  return map;
}

export function useThreadProvider(providerId: string): ThreadProvider | null {
  const { providers } = experimental_useProviders();
  return useMemo(
    () => providerById(providers).get(providerId) ?? null,
    [providers, providerId],
  );
}

function shortModelLabel(model: string): string {
  const separator = model.lastIndexOf("/");
  return separator === -1 ? model : model.slice(separator + 1);
}

// bb-fork(windows): fallback copy for a provider that does not declare its own
// bb-fork(windows): reasoning-level labels, mirroring the app's reasoning-labels helper.
const FALLBACK_REASONING_LABELS: Readonly<Record<string, string>> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  ultracode: "Ultracode",
  max: "Max",
  ultra: "Ultra",
};

function reasoningLevelLabel(
  reasoningLevel: string,
  provider: ThreadProvider | null,
): string {
  return (
    provider?.reasoningLevels?.find((level) => level.id === reasoningLevel)
      ?.label ??
    FALLBACK_REASONING_LABELS[reasoningLevel] ??
    reasoningLevel
  );
}

export function ThreadProviderMark({
  provider,
  onActivate,
}: {
  provider: ThreadProvider | null;
  onActivate: () => void;
}) {
  const handleClick = (event: MouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onActivate();
  };
  if (provider === null) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-sidebar-thread-provider={provider.id}
          role="img"
          aria-label={provider.displayName}
          className="relative z-10 flex shrink-0 pointer-events-auto items-center text-subtle-foreground"
          onClick={handleClick}
        >
          <ProviderIcon
            providerKind="agent"
            provider={provider}
            className="size-3.5"
            aria-label={provider.displayName}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{provider.displayName}</TooltipContent>
    </Tooltip>
  );
}

export function ThreadModelLabel({
  model,
  reasoningLevel,
  provider,
}: {
  model: string | null | undefined;
  reasoningLevel: string | null | undefined;
  provider: ThreadProvider | null;
}) {
  const modelText = model == null ? null : shortModelLabel(model);
  const reasoningText =
    reasoningLevel == null
      ? null
      : reasoningLevelLabel(reasoningLevel, provider);
  if (modelText === null && reasoningText === null) return null;
  return (
    <>
      {modelText === null ? null : (
        <span
          data-sidebar-thread-model=""
          className="min-w-0 truncate text-xs leading-none text-subtle-foreground"
        >
          {modelText}
        </span>
      )}
      {reasoningText === null ? null : (
        <span
          data-sidebar-thread-reasoning={reasoningLevel ?? undefined}
          className="shrink-0 text-xs leading-none text-subtle-foreground"
        >
          {reasoningText}
        </span>
      )}
    </>
  );
}
