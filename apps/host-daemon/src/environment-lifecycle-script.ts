import { StringDecoder } from "node:string_decoder";
import { DEFAULT_ENV_TEARDOWN_SCRIPT_NAME } from "@bb/domain";
// bb-fork(windows): native PowerShell lifecycle hooks.
import {
  buildWindowsLifecycleScriptCommand,
  resolveLifecycleScriptNames,
} from "./windows-lifecycle-script.js";
import { operationEnvironment } from "./operation-environment.js";
import type { HostDaemonContributedEnvEntry } from "@bb/host-daemon-contract";
import {
  execPortableFile,
  isProcessGroupAlive,
  killProcessGroup,
  spawnPortableOutputProcess,
  supportsProcessGroups,
  type ProcessStopResult,
} from "@bb/process-utils";
import {
  findGitBashProcessGroup,
  stopGitBashProcessGroup,
} from "./git-bash-process-group.js";
import fs from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { WorkspaceError } from "bb-environment-provider-host/git";
import { createTerminalOutputLineReader } from "bb-environment-provider-host/terminal-output";
import {
  createProvisionCancelledError,
  emitOutput,
  emitStep,
  throwIfProvisionAborted,
  type ProgressCallback,
} from "bb-environment-provider-host/transcript";

export interface RunSetupScriptArgs {
  workspacePath: string;
  timeoutMs: number;
  // bb-fork(windows): tests pin a platform so .ps1 resolution is deterministic.
  platform?: NodeJS.Platform;
  shellPath?: string;
  env?: NodeJS.ProcessEnv;
  contributedEnv?: readonly HostDaemonContributedEnvEntry[];
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}

type RunTeardownScriptArgs = RunSetupScriptArgs;

interface LifecycleScriptCommand {
  command: string;
  args: string[];
  text: string;
  pathPrefix: string[];
}

interface BuildLifecycleScriptCommandArgs {
  kind: "setup" | "teardown";
  scriptName: string;
  platform: NodeJS.Platform;
  scriptPath: string;
  windowsBashPath?: string | null;
}

interface RunLifecycleScriptArgs extends RunSetupScriptArgs {
  kind: "setup" | "teardown";
  scriptName: string;
  // bb-fork(windows): POSIX hook name to fall back to on Windows hosts.
  alternateScriptName?: string;
}

export function buildLifecycleScriptCommand(
  args: BuildLifecycleScriptCommandArgs,
): LifecycleScriptCommand {
  if (args.platform === "win32") {
    if (args.scriptName.endsWith(".ps1")) {
      // bb-fork(windows): native PowerShell hooks.
      return buildWindowsLifecycleScriptCommand(args);
    }
    if (args.windowsBashPath == null) {
      throw new WorkspaceError(
        "setup_script_failed",
        `${args.scriptName} needs Git for Windows: bb runs ${args.kind} scripts with the bash that Git installs, and it could not find one.`,
      );
    }
    return {
      command: args.windowsBashPath,
      args: [args.scriptPath],
      text: `bash ${args.scriptName}`,
      pathPrefix: [path.win32.dirname(args.windowsBashPath)],
    };
  }

  return {
    command: "env",
    args: ["bash", args.scriptPath],
    text: `env bash ${args.scriptName}`,
    pathPrefix: [],
  };
}

export class LifecycleScriptTerminationUnverifiedError extends Error {
  constructor(scriptName: string) {
    super(
      `${scriptName} was stopped, but bb could not confirm that all of its processes exited`,
    );
    this.name = "LifecycleScriptTerminationUnverifiedError";
  }
}

export async function assertScriptProcessTreeStopped(
  stop: Promise<ProcessStopResult> | undefined,
  scriptName: string,
): Promise<void> {
  if (stop === undefined) {
    return;
  }
  const result = await stop.catch(() => null);
  if (result === null || result.treeTermination !== "confirmed") {
    throw new LifecycleScriptTerminationUnverifiedError(scriptName);
  }
}

const GIT_SHELL_LOOKUP_TIMEOUT_MS = 10_000;
const WINDOWS_OUTPUT_CLOSE_GRACE_MS = 2_000;

export async function resolveWindowsBashPath(
  env: NodeJS.ProcessEnv,
  signal?: AbortSignal,
): Promise<string | null> {
  let gitShellPath: string;
  try {
    const result = await execPortableFile("git", ["var", "GIT_SHELL_PATH"], {
      cwd: process.cwd(),
      env,
      maxBuffer: 64 * 1024,
      signal,
      timeout: GIT_SHELL_LOOKUP_TIMEOUT_MS,
    });
    gitShellPath = path.win32.normalize(result.stdout.trim());
  } catch {
    return null;
  }
  if (gitShellPath.length === 0) {
    return null;
  }
  const bashPath = path.win32.join(
    path.win32.dirname(gitShellPath),
    "bash.exe",
  );
  try {
    await fs.access(bashPath);
    return bashPath;
  } catch {
    return gitShellPath;
  }
}

async function resolveLifecycleScriptPath(
  workspacePath: string,
  scriptName: string,
): Promise<string | null> {
  const scriptPath = path.join(workspacePath, scriptName);
  try {
    await fs.access(scriptPath);
  } catch {
    return null;
  }
  return scriptPath;
}

async function runLifecycleScript(
  args: RunLifecycleScriptArgs,
): Promise<{ ran: boolean }> {
  throwIfProvisionAborted(args.signal);
  let scriptPath = await resolveLifecycleScriptPath(
    args.workspacePath,
    args.scriptName,
  );
  // bb-fork(windows): fall back to the POSIX hook (runs via Git Bash).
  if (scriptPath === null && args.alternateScriptName !== undefined) {
    const alternatePath = await resolveLifecycleScriptPath(
      args.workspacePath,
      args.alternateScriptName,
    );
    if (alternatePath !== null) {
      scriptPath = alternatePath;
      args = { ...args, scriptName: args.alternateScriptName };
    }
  }
  if (!scriptPath) {
    return { ran: false };
  }

  throwIfProvisionAborted(args.signal);
  const { timeoutMs } = args;
  const env = operationEnvironment(
    args.contributedEnv ?? [],
    {
      ...(args.env ?? process.env),
      ...(args.shellPath !== undefined ? { PATH: args.shellPath } : {}),
    },
    true,
  );
  const lifecyclePlatform = args.platform ?? process.platform;
  const windowsBashPath =
    // bb-fork(windows): .ps1 hooks run through PowerShell, not Git Bash.
    lifecyclePlatform === "win32" && !args.scriptName.endsWith(".ps1")
      ? await resolveWindowsBashPath(env, args.signal)
      : null;
  throwIfProvisionAborted(args.signal);
  const command = buildLifecycleScriptCommand({
    kind: args.kind,
    scriptName: args.scriptName,
    platform: lifecyclePlatform,
    scriptPath,
    windowsBashPath,
  });
  const startedAt = Date.now();
  emitStep({
    onProgress: args.onProgress,
    key: `${args.kind}-started`,
    text: `Running ${args.scriptName}`,
    status: "started",
    startedAt,
  });

  const scriptEnv =
    command.pathPrefix.length === 0
      ? env
      : {
          ...env,
          PATH: [...command.pathPrefix, env.PATH ?? ""].join(path.delimiter),
        };
  const child = spawnPortableOutputProcess({
    command: command.command,
    args: command.args,
    cwd: args.workspacePath,
    detached: supportsProcessGroups(),
    env: scriptEnv,
  });
  const gitBash =
    windowsBashPath === null
      ? null
      : { bashPath: windowsBashPath, child, env: scriptEnv };
  const gitBashProcessGroup =
    gitBash === null ? null : findGitBashProcessGroup(gitBash);

  const outputLineReader = createTerminalOutputLineReader();
  let outputIndex = 0;
  let abortRequested = false;
  let timedOut = false;

  const emitScriptOutputLines = (lines: string[]): void => {
    for (const line of lines) {
      outputIndex += 1;
      emitOutput(args.onProgress, `${args.kind}-output-${outputIndex}`, line);
    }
  };

  const readers = [child.stdout, child.stderr].map((stream) => {
    const decoder = new StringDecoder("utf8");
    const emit = (text: string) => {
      emitScriptOutputLines(outputLineReader.push(text));
    };
    stream.on("data", (chunk: Buffer) => emit(decoder.write(chunk)));
    return () => emit(decoder.end());
  });

  let windowsTreeStop: Promise<ProcessStopResult> | undefined;
  let reportOutputLeftOpen: (() => void) | undefined;
  const outputLeftOpen = new Promise<null>((resolve) => {
    reportOutputLeftOpen = () => resolve(null);
  });
  const killScriptProcesses = (): void => {
    if (gitBash === null || gitBashProcessGroup === null) {
      killProcessGroup({ child, signal: "SIGKILL" });
      return;
    }
    if (windowsTreeStop !== undefined) {
      return;
    }
    windowsTreeStop = stopGitBashProcessGroup({
      ...gitBash,
      processGroup: gitBashProcessGroup,
    });
    windowsTreeStop
      .catch(() => undefined)
      .then(() => delay(WINDOWS_OUTPUT_CLOSE_GRACE_MS))
      .then(reportOutputLeftOpen, reportOutputLeftOpen);
  };
  const timeout = setTimeout(() => {
    timedOut = true;
    killScriptProcesses();
  }, timeoutMs);
  const abortLifecycleScript = () => {
    if (abortRequested) {
      return;
    }
    abortRequested = true;
    killScriptProcesses();
  };
  args.signal?.addEventListener("abort", abortLifecycleScript, {
    once: true,
  });
  if (args.signal?.aborted) {
    abortLifecycleScript();
  }

  try {
    const closed = new Promise<{
      exitCode: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (exitCode, signal) => resolve({ exitCode, signal }));
    });
    const result = await Promise.race([closed, outputLeftOpen]);
    if (result === null) {
      child.stdout.destroy();
      child.stderr.destroy();
      throw new LifecycleScriptTerminationUnverifiedError(args.scriptName);
    }

    if (abortRequested || timedOut) {
      while (isProcessGroupAlive(child)) await delay(25);
      await assertScriptProcessTreeStopped(windowsTreeStop, args.scriptName);
    }

    for (const flush of readers) flush();
    emitScriptOutputLines(outputLineReader.flush());
    const durationMs = Date.now() - startedAt;
    if (abortRequested || args.signal?.aborted) {
      emitStep({
        onProgress: args.onProgress,
        key: `${args.kind}-cancelled`,
        text: `${args.scriptName} cancelled`,
        status: "failed",
        startedAt,
        metadata: { durationMs },
      });
      throw createProvisionCancelledError(args.signal?.reason);
    }

    const failScript = (detail: string): never => {
      emitStep({
        onProgress: args.onProgress,
        key: `${args.kind}-failed`,
        text: `${args.scriptName} failed`,
        status: "failed",
        startedAt,
        metadata: { durationMs },
      });
      throw new WorkspaceError(
        "setup_script_failed",
        `${args.kind === "setup" ? "Setup" : "Teardown"} script ${detail}: ${scriptPath}`,
      );
    };

    if (timedOut) {
      failScript(`timed out after ${timeoutMs}ms`);
    }

    if (result.signal) {
      failScript(`exited via signal ${result.signal}`);
    }

    if ((result.exitCode ?? 0) !== 0) {
      failScript(`failed with exit code ${result.exitCode}`);
    }

    emitStep({
      onProgress: args.onProgress,
      key: `${args.kind}-completed`,
      text: `${args.scriptName} finished`,
      status: "completed",
      startedAt,
      metadata: { durationMs },
    });
    return { ran: true };
  } finally {
    clearTimeout(timeout);
    args.signal?.removeEventListener("abort", abortLifecycleScript);
  }
}

export function runSetupScript(
  args: RunSetupScriptArgs,
): Promise<{ ran: boolean }> {
  const platform = args.platform ?? process.platform;
  return runLifecycleScript({
    ...args,
    kind: "setup",
    // bb-fork(windows): .ps1 hooks on Windows, .sh elsewhere.
    ...resolveLifecycleScriptNames("setup", platform),
  });
}

export async function runTeardownScript(
  args: RunTeardownScriptArgs,
): Promise<{ ran: boolean }> {
  const startedAt = Date.now();
  let failureReported = false;
  const onProgress: ProgressCallback = (entry) => {
    if (entry.type === "step" && entry.key === "teardown-failed") {
      failureReported = true;
    }
    args.onProgress?.(entry);
  };
  try {
    return await runLifecycleScript({
      ...args,
      onProgress,
      kind: "teardown",
      // bb-fork(windows): .ps1 hooks on Windows, .sh elsewhere.
      ...resolveLifecycleScriptNames("teardown", args.platform ?? process.platform),
    });
  } catch (error) {
    if (args.signal?.aborted) throw error;
    if (!failureReported) {
      emitStep({
        onProgress: args.onProgress,
        key: "teardown-failed",
        text: `${DEFAULT_ENV_TEARDOWN_SCRIPT_NAME} failed`,
        status: "failed",
        startedAt,
        metadata: { durationMs: Date.now() - startedAt },
      });
    }
    emitOutput(
      args.onProgress,
      "teardown-error",
      error instanceof Error ? error.message : String(error),
    );
    return { ran: true };
  }
}
