import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildLifecycleScriptCommand,
  runSetupScript,
} from "./environment-lifecycle-script.js";

const directories: string[] = [];

async function workspace(
  kind: "setup" | "teardown",
  script: string,
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "bb-core-hooks-"));
  directories.push(directory);
  await writeFile(join(directory, `.bb-env-${kind}.sh`), script);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("native Windows environment lifecycle hooks", () => {
  it("builds a PowerShell command for Windows lifecycle scripts", () => {
    expect(
      buildLifecycleScriptCommand({
        kind: "setup",
        scriptName: ".bb-env-setup.ps1",
        platform: "win32",
        scriptPath: "C:\\repo\\.bb-env-setup.ps1",
      }),
    ).toMatchObject({
      command: "powershell.exe",
      args: [
        "-NoLogo",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        "C:\\repo\\.bb-env-setup.ps1",
      ],
      text: "powershell.exe -NoProfile -ExecutionPolicy Bypass -File .bb-env-setup.ps1",
    });
  });

  it("runs the POSIX setup hook through Git Bash when no .ps1 hook exists on Windows", async () => {
    const workspacePath = await workspace("setup", "echo forked\n");
    const output: string[] = [];
    const result = await runSetupScript({
      workspacePath,
      timeoutMs: 60_000,
      platform: "win32",
      onProgress: (entry) => output.push(`${entry.type}:${entry.text}`),
    });
    expect(result).toEqual({ ran: true });
    expect(output.some((line) => line.includes("forked"))).toBe(true);
  });

  it("prefers the .ps1 hook over the POSIX hook on Windows", async () => {
    const workspacePath = await workspace("setup", "echo posix-hook\n");
    await writeFile(
      join(workspacePath, ".bb-env-setup.ps1"),
      "Write-Output 'ps1-hook'\n",
    );
    const output: string[] = [];
    const result = await runSetupScript({
      workspacePath,
      timeoutMs: 60_000,
      platform: "win32",
      onProgress: (entry) => output.push(`${entry.type}:${entry.text}`),
    });
    expect(result).toEqual({ ran: true });
    expect(output.some((line) => line.includes("ps1-hook"))).toBe(true);
    expect(output.some((line) => line.includes("posix-hook"))).toBe(false);
  });
});
