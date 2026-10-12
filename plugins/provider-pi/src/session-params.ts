import {
  buildShellEnvOverrides,
  type DynamicTool,
  type InstructionMode,
  type ReasoningLevel,
} from "@get-bb/plugin-sdk/provider-bridge";

type PiReasoningLevel = "off" | "low" | "medium" | "high" | "xhigh" | "max";

function toPiThinkingLevel(
  reasoningLevel: ReasoningLevel | undefined,
): PiReasoningLevel | undefined {
  switch (reasoningLevel) {
    case "none":
      return "off";
    case "low":
    case "medium":
    case "high":
    case "xhigh":
    case "max":
      return reasoningLevel;
    case "ultracode":
    case "ultra":
    case undefined:
      return undefined;
  }
}

interface PiSessionOptions {
  model?: string | undefined;
  reasoningLevel?: ReasoningLevel | undefined;
  instructions?: string | undefined;
  envVars?: Record<string, string> | undefined;
  providerOptions?: Record<string, unknown> | undefined;
}

// bb-fork(compaction-model): the pi plugin surfaces the configured model as a
// provider option; normalize it once so "" and missing compare equal.
function readCompactionModelOption(
  options: PiSessionOptions,
): string | undefined {
  const raw = options.providerOptions?.["compactionModel"];
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : undefined;
}

interface BuildPiSessionParamsArgs {
  threadId: string;
  cwd: string;
  options: PiSessionOptions;
  instructionMode: InstructionMode;
  dynamicTools?: readonly DynamicTool[] | undefined;
  additionalSkillPaths?: readonly string[] | undefined;
}

export interface PiSessionParams {
  additionalSkillPaths?: readonly string[];
  appendSystemPrompt?: string;
  baseInstructions?: string;
  compactionModel?: string;
  cwd: string;
  dynamicTools?: readonly DynamicTool[];
  model?: string;
  shellEnvOverrides: Record<string, string>;
  thinkingLevel?: PiReasoningLevel;
}

export interface PiTurnOptions {
  compactionModel: string | undefined;
  model: string | undefined;
  thinkingLevel: PiReasoningLevel | undefined;
}

export function buildPiTurnOptions(options: PiSessionOptions): PiTurnOptions {
  return {
    compactionModel: readCompactionModelOption(options),
    model: options.model ? options.model : undefined,
    thinkingLevel: toPiThinkingLevel(options.reasoningLevel),
  };
}

export function buildPiSessionParams(
  args: BuildPiSessionParamsArgs,
): PiSessionParams {
  const instructions = args.options.instructions?.trim();
  const thinkingLevel = toPiThinkingLevel(args.options.reasoningLevel);
  return {
    cwd: args.cwd,
    shellEnvOverrides: {
      BB_THREAD_ID: args.threadId,
      ...buildShellEnvOverrides(args.options.envVars),
    },
    ...(instructions
      ? args.instructionMode === "replace"
        ? { baseInstructions: instructions }
        : { appendSystemPrompt: instructions }
      : {}),
    ...(args.options.model ? { model: args.options.model } : {}),
    // bb-fork(compaction-model): part of session construction so the value is
    // applied (and compared) on session start, resume, fork, and rebuild.
    ...(readCompactionModelOption(args.options) !== undefined
      ? { compactionModel: readCompactionModelOption(args.options) }
      : {}),
    ...(thinkingLevel ? { thinkingLevel } : {}),
    ...(args.dynamicTools && args.dynamicTools.length > 0
      ? { dynamicTools: args.dynamicTools }
      : {}),
    ...(args.additionalSkillPaths && args.additionalSkillPaths.length > 0
      ? { additionalSkillPaths: [...args.additionalSkillPaths] }
      : {}),
  };
}
