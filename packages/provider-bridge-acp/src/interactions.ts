import {
  isApprovalPendingInteractionPayload,
  isApprovalPendingInteractionResolution,
} from "@bb/domain";
import type {
  PendingInteractionApprovalDecision,
  PendingInteractionApprovalSubject,
  PendingInteractionPayload,
  PendingInteractionResolution,
} from "@bb/domain";
import { presentationDetail } from "@bb/provider-bridge-protocol/bridge-kit";
import { toolKindPresentation } from "./presentation.js";
import {
  type AcpToolCallOperation,
  type AcpToolCallOperationInput,
  type AcpToolCallPathOptions,
  classifyAcpToolCall as classifyAcpToolCallOperation,
  extractAcpToolCallPaths,
  resolveAcpFileChangeWriteScope,
} from "./tool-call-operation.js";
import {
  boundAcpToolArgs,
  boundAcpToolPayload,
  classifyAcpToolCall,
  extractAcpToolCallOutputText,
  type AcpInjectedTool,
} from "./tool-classification.js";
import type {
  AcpPermissionOptionKind,
  AcpToolCallUpdateEvent,
  AcpToolKind,
} from "./wire.js";
import type { AcpDialect } from "./dialect.js";

type AcpDialectToolCallClassifier = NonNullable<AcpDialect["classifyToolCall"]>;

type ToolUseApprovalSubject = Extract<
  PendingInteractionApprovalSubject,
  { kind: "tool_use" }
>;

interface AcpPermissionResponse {
  decision: "allow_once" | "allow_for_session" | "deny";
}

interface AcpPermissionToolCall extends AcpToolCallOperationInput {
  toolCallId: string;
  kind?: AcpToolKind | undefined;
  rawKind?: string | undefined;
  startedToolCall?: AcpToolCallUpdateEvent | undefined;
  injectedTool?: AcpInjectedTool | undefined;
}

const PERMISSION_WRITE_RAW_KIND_TOKENS = new Set([
  "write",
  "edit",
  "patch",
  "delete",
  "rename",
  "move",
  "replace",
  "append",
  "insert",
  "remove",
]);
const PERMISSION_DELETE_RAW_KIND_TOKENS = new Set(["delete", "remove"]);
const PERMISSION_RAW_INPUT_PATH_KEYS = [
  "path",
  "filePath",
  "file_path",
  "filepath",
  "target_file",
];
const PERMISSION_RAW_INPUT_CONTENT_KEYS = [
  "content",
  "newText",
  "new_text",
  "newString",
  "new_string",
  "fileText",
  "file_text",
  "edits",
  "patch",
  "diff",
];
const PERMISSION_RAW_INPUT_COMMAND_KEYS = [
  "command",
  "cmd",
  "shell_command",
  "shellCommand",
];

function rawInputRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function rawKindTokens(rawKind: string): string[] {
  return rawKind
    .toLowerCase()
    .split(/[^a-z]+/u)
    .filter((token) => token.length > 0);
}

function rawKindHasToken(
  rawKind: string,
  tokens: ReadonlySet<string>,
): boolean {
  return rawKindTokens(rawKind).some((token) => tokens.has(token));
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function permissionRawInputWriteShape(
  record: Record<string, unknown>,
): boolean {
  const hasPath = PERMISSION_RAW_INPUT_PATH_KEYS.some((key) =>
    isNonBlankString(record[key]),
  );
  const hasContent = PERMISSION_RAW_INPUT_CONTENT_KEYS.some(
    (key) => record[key] !== undefined && record[key] !== null,
  );
  return hasPath && hasContent;
}

function permissionRawInputCommand(
  record: Record<string, unknown>,
): string | undefined {
  for (const key of PERMISSION_RAW_INPUT_COMMAND_KEYS) {
    const value = record[key];
    if (isNonBlankString(value)) {
      return value;
    }
  }
  return undefined;
}

function classifyAcpPermissionFallback(
  toolCall: AcpPermissionToolCall,
  options: AcpToolCallPathOptions | undefined,
): AcpToolCallOperation {
  const ownPaths = extractAcpToolCallPaths(toolCall, options);
  const paths =
    ownPaths.length > 0 || toolCall.startedToolCall === undefined
      ? ownPaths
      : extractAcpToolCallPaths(toolCall.startedToolCall, options);
  const rawKind = toolCall.rawKind ?? toolCall.startedToolCall?.rawKind;
  if (
    rawKind !== undefined &&
    rawKindHasToken(rawKind, PERMISSION_WRITE_RAW_KIND_TOKENS)
  ) {
    return {
      kind: "file_change",
      changeKind: rawKindHasToken(rawKind, PERMISSION_DELETE_RAW_KIND_TOKENS)
        ? "delete"
        : "update",
      paths,
    };
  }
  const rawInput =
    rawInputRecord(toolCall.rawInput) ??
    rawInputRecord(toolCall.startedToolCall?.rawInput);
  if (rawInput !== undefined && permissionRawInputWriteShape(rawInput)) {
    return { kind: "file_change", changeKind: "update", paths };
  }
  const command =
    rawInput === undefined ? undefined : permissionRawInputCommand(rawInput);
  return command === undefined
    ? { kind: "generic" }
    : { kind: "command", command };
}

function classifyAcpPermission(
  toolCall: AcpPermissionToolCall,
  options: AcpToolCallPathOptions | undefined,
): AcpToolCallOperation {
  const own = classifyAcpToolCallOperation(toolCall, options);
  if (own.kind !== "generic") {
    return own;
  }
  if (toolCall.startedToolCall) {
    const started = classifyAcpToolCallOperation(
      toolCall.startedToolCall,
      options,
    );
    if (started.kind !== "generic") {
      return started;
    }
  }
  return classifyAcpPermissionFallback(toolCall, options);
}

function permissionToolCallEvent(
  toolCall: AcpPermissionToolCall,
): AcpToolCallUpdateEvent {
  return {
    sessionUpdate: "tool_call",
    toolCallId: toolCall.toolCallId,
    ...(toolCall.title !== undefined ? { title: toolCall.title } : {}),
    ...(toolCall.kind !== undefined ? { kind: toolCall.kind } : {}),
    ...(toolCall.rawKind !== undefined ? { rawKind: toolCall.rawKind } : {}),
    ...(toolCall.content !== undefined
      ? { content: [...toolCall.content] }
      : {}),
    ...(toolCall.locations !== undefined
      ? { locations: [...toolCall.locations] }
      : {}),
    ...(toolCall.rawInput !== undefined ? { rawInput: toolCall.rawInput } : {}),
  };
}

const PERMISSION_DETAIL_FIELD_LIMIT = 4;
const PERMISSION_DETAIL_VALUE_MAX_CHARS = 120;
const PERMISSION_DETAIL_PRIORITY_KEYS = [
  "command",
  "cmd",
  "shell_command",
  "shellCommand",
  "path",
  "filePath",
  "file_path",
  "filepath",
  "target_file",
  "url",
  "uri",
  "query",
  "pattern",
  "glob",
  "content",
  "newText",
  "new_string",
  "description",
  "prompt",
  "message",
];
const SENSITIVE_DETAIL_TOKEN_PATTERN =
  /(?:^|[^a-z])(?:secret|token|password|passwd|credential|credentials|authorization|bearer|apikey|authkey)(?:[^a-z]|$)/u;
const SENSITIVE_DETAIL_KEY_PATTERN =
  /(?:api|auth|access|private|session|ssh|client)[_-]?key/iu;

function isSensitiveDetailKey(key: string): boolean {
  const lowered = key.toLowerCase();
  return (
    SENSITIVE_DETAIL_TOKEN_PATTERN.test(lowered) ||
    SENSITIVE_DETAIL_KEY_PATTERN.test(lowered)
  );
}

function summarizeDetailValue(value: unknown): string | undefined {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  if (raw === undefined) {
    return undefined;
  }
  const flat = raw.replace(/\s+/gu, " ").trim();
  if (flat.length === 0) {
    return undefined;
  }
  const chars = [...flat];
  return chars.length > PERMISSION_DETAIL_VALUE_MAX_CHARS
    ? `${chars.slice(0, PERMISSION_DETAIL_VALUE_MAX_CHARS - 1).join("")}…`
    : flat;
}

function permissionToolCallDetail(
  toolCall: AcpPermissionToolCall,
): string | undefined {
  const rawInput = toolCall.rawInput ?? toolCall.startedToolCall?.rawInput;
  if (rawInput === undefined) {
    return undefined;
  }
  const bounded = boundAcpToolArgs(rawInput);
  if (bounded === undefined) {
    const payload = boundAcpToolPayload(rawInput);
    if (typeof payload !== "string") {
      return undefined;
    }
    const flat = payload.replace(/\s+/gu, " ").trim();
    return flat.length === 0 ? undefined : presentationDetail(flat);
  }
  const entries = Object.entries(bounded);
  const truncated = entries.length === 1 ? entries[0] : undefined;
  if (
    truncated !== undefined &&
    truncated[0] === "truncated" &&
    typeof truncated[1] === "string"
  ) {
    const flat = truncated[1].replace(/\s+/gu, " ").trim();
    return flat.length === 0 ? undefined : presentationDetail(flat);
  }
  const priority = new Set(PERMISSION_DETAIL_PRIORITY_KEYS);
  const ordered = [
    ...entries.filter(([key]) => priority.has(key)),
    ...entries.filter(([key]) => !priority.has(key)),
  ];
  const segments: string[] = [];
  for (const [key, value] of ordered) {
    const text = isSensitiveDetailKey(key)
      ? "[redacted]"
      : summarizeDetailValue(value);
    if (text === undefined) {
      continue;
    }
    segments.push(`${key}: ${text}`);
    if (segments.length >= PERMISSION_DETAIL_FIELD_LIMIT) {
      break;
    }
  }
  return segments.length === 0
    ? undefined
    : presentationDetail(segments.join(", "));
}

function buildToolUseSubject(
  toolCall: AcpPermissionToolCall | undefined,
  options: AcpToolCallPathOptions | undefined,
  dialectClassify: AcpDialectToolCallClassifier | undefined,
): ToolUseApprovalSubject {
  if (toolCall === undefined) {
    return {
      kind: "tool_use",
      itemId: "acp-permission",
      tool: "tool",
      presentation: toolKindPresentation({
        kind: undefined,
        title: "ACP permission request",
      }),
    };
  }
  const classify = (event: AcpToolCallUpdateEvent) =>
    (toolCall.injectedTool === undefined
      ? dialectClassify?.(event)
      : undefined) ??
    classifyAcpToolCall(event, toolCall.injectedTool, options);
  const own = classify(permissionToolCallEvent(toolCall));
  const described =
    own.presentation.title === undefined && toolCall.startedToolCall
      ? classify(toolCall.startedToolCall)
      : own;
  const detail = permissionToolCallDetail(toolCall);
  const presentation =
    detail === undefined || described.presentation.detail !== undefined
      ? described.presentation
      : { ...described.presentation, detail };
  return {
    kind: "tool_use",
    itemId: toolCall.toolCallId,
    tool:
      described.item.type === "tool"
        ? described.item.tool
        : (toolCall.kind ??
          toolCall.startedToolCall?.kind ??
          described.item.type),
    presentation,
  };
}

function permissionReason(
  toolCall: AcpPermissionToolCall | undefined,
): string | undefined {
  if (toolCall === undefined) {
    return undefined;
  }
  const content = toolCall.content ?? toolCall.startedToolCall?.content;
  if (content === undefined) {
    return undefined;
  }
  return extractAcpToolCallOutputText({
    sessionUpdate: "tool_call",
    toolCallId: toolCall.toolCallId,
    content: [...content],
  });
}

export function buildAcpApprovalDecisions(
  options: readonly { kind: AcpPermissionOptionKind }[],
): PendingInteractionApprovalDecision[] {
  const kinds = new Set(options.map((option) => option.kind));
  const decisions: PendingInteractionApprovalDecision[] = [];
  if (kinds.has("allow_once")) {
    decisions.push("allow_once");
  }
  if (kinds.has("allow_always")) {
    decisions.push("allow_for_session");
  }
  if (kinds.has("reject_once") || kinds.has("reject_always")) {
    decisions.push("deny");
  }
  return decisions.length > 0 ? decisions : ["deny"];
}

export function buildAcpPermissionInteractionPayload(args: {
  toolCall: AcpPermissionToolCall | undefined;
  options: readonly { kind: AcpPermissionOptionKind }[];
  cwd?: string | undefined;
  classifyToolCall?: AcpDialectToolCallClassifier | undefined;
}): PendingInteractionPayload {
  const toolCall = args.toolCall;
  const pathOptions = { cwd: args.cwd };
  const availableDecisions = buildAcpApprovalDecisions(args.options);
  const reason = permissionReason(toolCall) ?? null;
  const operation = toolCall
    ? classifyAcpPermission(toolCall, pathOptions)
    : undefined;
  if (toolCall && operation?.kind === "file_change") {
    const ownPaths = extractAcpToolCallPaths(toolCall, pathOptions);
    return {
      kind: "approval",
      subject: {
        kind: "file_change",
        itemId: toolCall.toolCallId,
        writeScope: resolveAcpFileChangeWriteScope(
          ownPaths.length > 0 ? ownPaths : operation.paths,
        ),
        sessionGrant: null,
      },
      reason,
      availableDecisions,
    };
  }
  if (toolCall && operation?.kind === "command") {
    return {
      kind: "approval",
      subject: {
        kind: "command",
        itemId: toolCall.toolCallId,
        command: operation.command,
        cwd: null,
        actions: [{ type: "unknown", command: operation.command }],
        sessionGrant: null,
      },
      reason,
      availableDecisions,
    };
  }
  return {
    kind: "approval",
    subject: buildToolUseSubject(toolCall, pathOptions, args.classifyToolCall),
    reason,
    availableDecisions,
  };
}

export function resolveAcpPermissionDecision(args: {
  payload: PendingInteractionPayload;
  resolution: PendingInteractionResolution;
}): AcpPermissionResponse | null {
  if (
    !isApprovalPendingInteractionPayload(args.payload) ||
    !isApprovalPendingInteractionResolution(args.resolution)
  ) {
    return null;
  }
  return { decision: args.resolution.decision };
}
