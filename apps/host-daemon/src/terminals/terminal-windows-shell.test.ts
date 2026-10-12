import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listWindowsTerminalShells,
  resolvePickedWindowsTerminalShell,
  windowsShellArgsOverride,
} from "./terminal-windows-shell.js";

// bb-fork(windows): the enumeration behind host.list_terminal_shells and the
// Start terminal picker's shell-id resolution. Default-shell resolution lives
// in terminal-shell.ts upstream.

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

describe("listWindowsTerminalShells", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [
      "PATH",
      "Path",
      "ProgramFiles",
      "ProgramFiles(x86)",
      "SystemRoot",
      "LOCALAPPDATA",
    ]) {
      savedEnv[key] = process.env[key];
    }
  });

  afterEach(async () => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await Promise.all(
      tempDirs
        .splice(0)
        .map((directory) => fs.rm(directory, { recursive: true, force: true })),
    );
  });

  async function makeExecutableFile(
    directory: string,
    fileName: string,
  ): Promise<string> {
    await fs.mkdir(directory, { recursive: true });
    const filePath = path.join(directory, fileName);
    await fs.writeFile(filePath, "");
    await fs.chmod(filePath, 0o755);
    return filePath;
  }

  async function makeShellDir(
    prefix: string,
    fileName: string,
  ): Promise<string> {
    const directory = await makeTempDir(prefix);
    await makeExecutableFile(directory, fileName);
    return directory;
  }

  async function setEmptyInstallLocations(): Promise<void> {
    process.env.ProgramFiles = await makeTempDir("bb-terminal-resolver-pf-");
    process.env["ProgramFiles(x86)"] = await makeTempDir(
      "bb-terminal-resolver-pfx86-",
    );
    process.env.SystemRoot = await makeTempDir("bb-terminal-resolver-sr-");
    process.env.LOCALAPPDATA = await makeTempDir("bb-terminal-resolver-la-");
  }

  it("lists every detected shell with the default first", async () => {
    const pwshDir = await makeShellDir(
      "bb-terminal-resolver-list-pwsh-",
      "pwsh.exe",
    );
    const powershellDir = await makeShellDir(
      "bb-terminal-resolver-list-ps-",
      "powershell.exe",
    );
    const programFiles = await makeTempDir("bb-terminal-resolver-list-pf-");
    const gitBashPath = await makeExecutableFile(
      path.join(programFiles, "Git", "bin"),
      "bash.exe",
    );

    process.env.PATH = [pwshDir, powershellDir].join(";");
    await setEmptyInstallLocations();
    process.env.ProgramFiles = programFiles;

    await expect(listWindowsTerminalShells()).resolves.toEqual([
      {
        id: "pwsh",
        isDefault: true,
        label: "PowerShell 7",
        path: path.join(pwshDir, "pwsh.exe"),
      },
      {
        id: "powershell",
        isDefault: false,
        label: "Windows PowerShell",
        path: path.join(powershellDir, "powershell.exe"),
      },
      {
        id: "git-bash",
        isDefault: false,
        label: "Git Bash",
        path: gitBashPath,
      },
    ]);
  });

  it("uses Git Bash as the default when it is the only shell", async () => {
    const programFiles = await makeTempDir("bb-terminal-resolver-only-pf-");
    const gitBashPath = await makeExecutableFile(
      path.join(programFiles, "Git", "bin"),
      "bash.exe",
    );

    process.env.PATH = await makeTempDir("bb-terminal-resolver-only-path-");
    await setEmptyInstallLocations();
    process.env.ProgramFiles = programFiles;

    await expect(listWindowsTerminalShells()).resolves.toEqual([
      {
        id: "git-bash",
        isDefault: true,
        label: "Git Bash",
        path: gitBashPath,
      },
    ]);
  });
});

describe("resolvePickedWindowsTerminalShell", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [
      "PATH",
      "Path",
      "ProgramFiles",
      "ProgramFiles(x86)",
      "SystemRoot",
      "LOCALAPPDATA",
    ]) {
      savedEnv[key] = process.env[key];
    }
  });

  afterEach(async () => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await Promise.all(
      tempDirs
        .splice(0)
        .map((directory) => fs.rm(directory, { recursive: true, force: true })),
    );
  });

  async function makeExecutableFile(
    directory: string,
    fileName: string,
  ): Promise<string> {
    await fs.mkdir(directory, { recursive: true });
    const filePath = path.join(directory, fileName);
    await fs.writeFile(filePath, "");
    await fs.chmod(filePath, 0o755);
    return filePath;
  }

  async function setEmptyInstallLocations(): Promise<void> {
    process.env.ProgramFiles = await makeTempDir("bb-terminal-resolver-pf-");
    process.env["ProgramFiles(x86)"] = await makeTempDir(
      "bb-terminal-resolver-pfx86-",
    );
    process.env.SystemRoot = await makeTempDir("bb-terminal-resolver-sr-");
    process.env.LOCALAPPDATA = await makeTempDir("bb-terminal-resolver-la-");
  }

  it("finds Git Bash beside a git.exe on PATH", async () => {
    const gitInstall = await makeTempDir("bb-terminal-resolver-git-");
    await makeExecutableFile(path.join(gitInstall, "cmd"), "git.exe");
    const gitBashPath = await makeExecutableFile(
      path.join(gitInstall, "bin"),
      "bash.exe",
    );

    process.env.PATH = path.join(gitInstall, "cmd");
    await setEmptyInstallLocations();

    await expect(
      resolvePickedWindowsTerminalShell("git-bash"),
    ).resolves.toBe(gitBashPath);
  });

  it("returns null for an unknown or automatic shell id", async () => {
    const pwshDir = await makeTempDir("bb-terminal-resolver-fallback-");
    await fs.writeFile(path.join(pwshDir, "pwsh.exe"), "");
    process.env.PATH = pwshDir;
    await setEmptyInstallLocations();

    await expect(
      resolvePickedWindowsTerminalShell("nope"),
    ).resolves.toBeNull();
    await expect(
      resolvePickedWindowsTerminalShell("__automatic__"),
    ).resolves.toBeNull();
  });
});

describe("windowsShellArgsOverride", () => {
  const gitBash = "C:\\Program Files\\Git\\bin\\bash.exe";

  it("starts Git Bash like its own launcher and leaves commands to posix args", () => {
    expect(windowsShellArgsOverride({ mode: "shell" }, gitBash)).toEqual([
      "--login",
      "-i",
    ]);
    expect(
      windowsShellArgsOverride(
        { mode: "command", command: "ls" },
        gitBash,
      ),
    ).toBeNull();
  });

  it("ignores non-bash shells so the shared args apply", () => {
    expect(
      windowsShellArgsOverride({ mode: "shell" }, "/bin/zsh"),
    ).toBeNull();
    expect(
      windowsShellArgsOverride({ mode: "shell" }, "C:\pwsh.exe"),
    ).toBeNull();
  });
});
