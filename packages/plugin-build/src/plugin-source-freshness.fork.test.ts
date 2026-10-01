import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hasPluginSourceChanges } from "./plugin-source-freshness.fork.js";

const BUILD_TIME = new Date("2026-01-02T00:00:00Z");
const OLDER_TIME = new Date("2026-01-01T00:00:00Z");
const NEWER_TIME = new Date("2026-01-03T00:00:00Z");

async function makePluginDir(): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), "bb-plugin-freshness-"));
  await mkdir(join(rootDir, "dist"), { recursive: true });
  await writeFile(join(rootDir, "dist", "app.js"), "built");
  await utimes(join(rootDir, "dist", "app.js"), BUILD_TIME, BUILD_TIME);
  return rootDir;
}

describe("hasPluginSourceChanges", () => {
  const rootDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      rootDirs
        .splice(0)
        .map((rootDir) => rm(rootDir, { recursive: true, force: true })),
    );
  });

  it("reports no change when the artifact is newer than every source file", async () => {
    const rootDir = await makePluginDir();
    rootDirs.push(rootDir);
    await writeFile(join(rootDir, "app.tsx"), "source");
    await utimes(join(rootDir, "app.tsx"), OLDER_TIME, OLDER_TIME);

    await expect(
      hasPluginSourceChanges({
        rootDir,
        artifactRelativePaths: ["dist/app.js"],
      }),
    ).resolves.toBe(false);
  });

  it("reports a change when a source file is newer than the artifact", async () => {
    const rootDir = await makePluginDir();
    rootDirs.push(rootDir);
    await writeFile(join(rootDir, "app.tsx"), "source");
    await utimes(join(rootDir, "app.tsx"), NEWER_TIME, NEWER_TIME);

    await expect(
      hasPluginSourceChanges({
        rootDir,
        artifactRelativePaths: ["dist/app.js"],
      }),
    ).resolves.toBe(true);
  });

  it("ignores dist, node_modules, and .turbo entries", async () => {
    const rootDir = await makePluginDir();
    rootDirs.push(rootDir);
    await writeFile(join(rootDir, "app.tsx"), "source");
    await utimes(join(rootDir, "app.tsx"), OLDER_TIME, OLDER_TIME);
    await writeFile(join(rootDir, "dist", "app.css"), "built");
    await utimes(join(rootDir, "dist", "app.css"), NEWER_TIME, NEWER_TIME);
    await mkdir(join(rootDir, "node_modules"), { recursive: true });
    await writeFile(join(rootDir, "node_modules", "dep.js"), "dep");
    await utimes(
      join(rootDir, "node_modules", "dep.js"),
      NEWER_TIME,
      NEWER_TIME,
    );
    await mkdir(join(rootDir, ".turbo"), { recursive: true });
    await writeFile(join(rootDir, ".turbo", "turbo-test.log"), "log");
    await utimes(
      join(rootDir, ".turbo", "turbo-test.log"),
      NEWER_TIME,
      NEWER_TIME,
    );

    await expect(
      hasPluginSourceChanges({
        rootDir,
        artifactRelativePaths: ["dist/app.js"],
      }),
    ).resolves.toBe(false);
  });

  it("reports a change when no build artifact exists", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "bb-plugin-freshness-"));
    rootDirs.push(rootDir);
    await writeFile(join(rootDir, "app.tsx"), "source");

    await expect(
      hasPluginSourceChanges({
        rootDir,
        artifactRelativePaths: ["dist/app.js"],
      }),
    ).resolves.toBe(true);
  });
});
