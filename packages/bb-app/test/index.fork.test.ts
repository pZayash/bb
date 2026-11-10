// bb-fork(windows): Windows does not report POSIX file modes, so the env.json
// bb-fork(windows): permission assertion is skipped there.
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runBbApp } from "../src/launcher.js";

function expectRestrictedFileMode(filePath: string): void {
  if (process.platform === "win32") {
    return;
  }
  expect(statSync(filePath).mode & 0o777).toBe(0o600);
}

describe("bb-app launcher", () => {
  it("stores managed env values from the env command", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "bb-app-env-command-"));

    await runBbApp([
      "--data-dir",
      dataDir,
      "env",
      "set",
      "ANTHROPIC_API_KEY",
      "test-anthropic-key",
    ]);

    expect(JSON.parse(readFileSync(join(dataDir, "env.json"), "utf8"))).toEqual(
      {
        env: {
          ANTHROPIC_API_KEY: "test-anthropic-key",
        },
      },
    );
    expectRestrictedFileMode(join(dataDir, "env.json"));
  });
});
