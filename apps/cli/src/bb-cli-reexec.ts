import { spawnHostProcessSync as spawnSync } from "@bb/process-utils/host-process";
import { realpathSync } from "node:fs";
import { resolve, win32 } from "node:path";
// bb-fork(windows): a bb.cmd shim resolves to its sibling bb entry, and a
// bb-fork(windows): POSIX-sh dev shim has no Node-spawnable entry at all.
import {
  isNodeHostedBbCliEntry,
  resolveBbCliEntryTarget,
} from "./bb-cli-reexec.windows.js";

export const BB_CLI_REEXEC_ENV = "BB_CLI_REEXEC";

interface MaybeReexecViaBbCliArgs {
  env?: NodeJS.ProcessEnv;
  argv?: string[];
  currentExecutablePath?: string;
  reexec?: (args: {
    target: string;
    argv: string[];
    env: NodeJS.ProcessEnv;
  }) => void;
}

interface ResolveBbCliLaunchArgs {
  argv: string[];
  nodePath: string;
  platform: NodeJS.Platform;
  target: string;
}

export function resolveBbCliLaunch(args: ResolveBbCliLaunchArgs): {
  command: string;
  args: string[];
} {
  return args.platform === "win32" && win32.extname(args.target) === ""
    ? { command: args.nodePath, args: [args.target, ...args.argv] }
    : { command: args.target, args: args.argv };
}

function tryRealpath(path: string): string | null {
  try {
    return realpathSync(resolve(path));
  } catch {
    return null;
  }
}

export function maybeReexecViaBbCli(
  options: MaybeReexecViaBbCliArgs = {},
): void {
  const env = options.env ?? process.env;
  if (env[BB_CLI_REEXEC_ENV] === "1") {
    return;
  }

  const targetRaw = env.BB_CLI?.trim();
  if (!targetRaw) {
    return;
  }

  const currentRaw = options.currentExecutablePath ?? process.argv[1];
  if (!currentRaw) {
    return;
  }

  const target = tryRealpath(targetRaw);
  const current = tryRealpath(currentRaw);
  if (target === null || current === null) {
    return;
  }

  // bb-fork(windows): a bb.cmd shim and its sibling bb entry are one CLI.
  const entryTarget = tryRealpath(resolveBbCliEntryTarget(target));
  if (entryTarget === null || entryTarget === current) {
    return;
  }

  const argv = options.argv ?? process.argv.slice(2);
  const childEnv: NodeJS.ProcessEnv = {
    ...env,
    [BB_CLI_REEXEC_ENV]: "1",
  };

  if (options.reexec) {
    options.reexec({ target: entryTarget, argv, env: childEnv });
    return;
  }

  // bb-fork(windows): a POSIX-sh shim in BB_CLI has no Node-spawnable entry; keep this process.
  if (
    process.platform === "win32" &&
    !isNodeHostedBbCliEntry(entryTarget)
  ) {
    return;
  }
  const launch = resolveBbCliLaunch({
    argv,
    nodePath: process.execPath,
    platform: process.platform,
    target: entryTarget,
  });
  const result = spawnSync(launch.command, launch.args, {
    env: childEnv,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) {
    process.stderr.write(
      `bb: failed to re-exec BB_CLI=${target}: ${result.error.message}\n`,
    );
    process.exit(1);
  }
  process.exit(result.status === null ? 1 : result.status);
}
