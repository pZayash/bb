import {
  standardReasoningLevelRank,
  type ReasoningLevel,
} from "./shared-types.js";

const UNRANKED_PREVIOUS_LEVEL: ReasoningLevel = "medium";

export function reconcileReasoningLevel(
  previous: ReasoningLevel,
  supported: readonly ReasoningLevel[],
  unrankedFallback?: ReasoningLevel,
): ReasoningLevel {
  if (supported.length === 0) {
    throw new Error(
      "reconcileReasoningLevel requires at least one supported level",
    );
  }
  if (supported.includes(previous)) return previous;

  const effectivePrevious = previous === "ultracode" ? "xhigh" : previous;
  if (supported.includes(effectivePrevious)) return effectivePrevious;

  const previousRank =
    standardReasoningLevelRank(effectivePrevious) ??
    standardReasoningLevelRank(UNRANKED_PREVIOUS_LEVEL) ??
    0;
  let best: { level: ReasoningLevel; rank: number; distance: number } | null =
    null;
  for (const candidate of supported) {
    const rank = standardReasoningLevelRank(candidate);
    if (rank === null) {
      continue;
    }
    const distance = Math.abs(rank - previousRank);
    if (
      best === null ||
      distance < best.distance ||
      (distance === best.distance && rank > best.rank)
    ) {
      best = { level: candidate, rank, distance };
    }
  }
  if (best !== null) {
    return best.level;
  }
  return unrankedFallback !== undefined && supported.includes(unrankedFallback)
    ? unrankedFallback
    : supported[0];
}

export interface ReasoningLevelCatalogModel {
  readonly reasoningDiscovery: "known" | "unknown";
  readonly supportedReasoningEfforts: readonly {
    readonly reasoningEffort: ReasoningLevel;
  }[];
  readonly defaultReasoningEffort: ReasoningLevel;
}

export interface ReasoningLevelSupport {
  readonly levels: readonly ReasoningLevel[];
  readonly defaultLevel: ReasoningLevel | null;
  readonly source: "model" | "declared" | "unknown";
}

export function resolveReasoningLevelSupport(args: {
  declared: readonly ReasoningLevel[];
  model?: ReasoningLevelCatalogModel | null;
}): ReasoningLevelSupport {
  const model = args.model;
  if (
    model !== null &&
    model !== undefined &&
    model.reasoningDiscovery === "known"
  ) {
    return {
      defaultLevel: model.defaultReasoningEffort,
      levels: [
        ...new Set([
          model.defaultReasoningEffort,
          ...model.supportedReasoningEfforts.map(
            (effort) => effort.reasoningEffort,
          ),
        ]),
      ],
      source: "model",
    };
  }
  return args.declared.length > 0
    ? { defaultLevel: null, levels: args.declared, source: "declared" }
    : { defaultLevel: null, levels: [], source: "unknown" };
}

export interface ReasoningLevelCandidateResolution {
  readonly candidateSupported: boolean;
  readonly level: ReasoningLevel;
  readonly support: ReasoningLevelSupport;
}

export function resolveReasoningLevelCandidate(args: {
  candidate: ReasoningLevel;
  declared: readonly ReasoningLevel[];
  model?: ReasoningLevelCatalogModel | null;
}): ReasoningLevelCandidateResolution {
  const support = resolveReasoningLevelSupport({
    declared: args.declared,
    model: args.model,
  });
  if (
    support.levels.length === 0 ||
    support.levels.includes(args.candidate)
  ) {
    return {
      candidateSupported: true,
      level: args.candidate,
      support,
    };
  }
  return {
    candidateSupported: false,
    level: reconcileReasoningLevel(
      args.candidate,
      support.levels,
      support.defaultLevel ?? undefined,
    ),
    support,
  };
}
