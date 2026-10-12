import {
  DEFAULT_ENV_SETUP_SCRIPT_NAME,
  DEFAULT_ENV_TEARDOWN_SCRIPT_NAME,
  WINDOWS_ENV_SETUP_SCRIPT_NAME,
  WINDOWS_ENV_TEARDOWN_SCRIPT_NAME,
} from "@bb/domain";

export interface LifecycleScriptNames {
  scriptName: string;
  alternateScriptName?: string;
}

export function resolveLifecycleScriptNames(
  kind: "setup" | "teardown",
  platform: NodeJS.Platform,
): LifecycleScriptNames {
  if (platform !== "win32") {
    return {
      scriptName:
        kind === "setup"
          ? DEFAULT_ENV_SETUP_SCRIPT_NAME
          : DEFAULT_ENV_TEARDOWN_SCRIPT_NAME,
    };
  }
  return {
    scriptName:
      kind === "setup"
        ? WINDOWS_ENV_SETUP_SCRIPT_NAME
        : WINDOWS_ENV_TEARDOWN_SCRIPT_NAME,
    alternateScriptName:
      kind === "setup"
        ? DEFAULT_ENV_SETUP_SCRIPT_NAME
        : DEFAULT_ENV_TEARDOWN_SCRIPT_NAME,
  };
}

export interface WindowsLifecycleScriptCommand {
  command: string;
  args: string[];
  text: string;
  pathPrefix: string[];
}

export function buildWindowsLifecycleScriptCommand(args: {
  kind: "setup" | "teardown";
  scriptName: string;
  scriptPath: string;
}): WindowsLifecycleScriptCommand {
  return {
    command: "powershell.exe",
    args: [
      "-NoLogo",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      args.scriptPath,
    ],
    text: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ${args.scriptName}`,
    pathPrefix: [],
  };
}
