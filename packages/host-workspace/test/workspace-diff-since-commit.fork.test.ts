// bb-fork(file-diff): a commit sha is a usable comparison ref, not only a branch name.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runGit } from "../src/git.js";
import { Workspace } from "../src/workspace.js";
import type { WorkspaceDiffTarget } from "@bb/domain";

const tempDirs: string[] = [];

async function initRepo(): Promise<string> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "bb-since-repo-"));
  tempDirs.push(repoPath);
  await runGit(["init", "-b", "main"], { cwd: repoPath });
  await runGit(["config", "user.name", "BB Tests"], { cwd: repoPath });
  await runGit(["config", "user.email", "bb@example.com"], { cwd: repoPath });
  await runGit(["config", "core.autocrlf", "false"], { cwd: repoPath });
  return repoPath;
}

async function write(
  repoPath: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  const full = path.join(repoPath, relativePath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, contents, "utf8");
}

async function commitAll(repoPath: string, message: string): Promise<string> {
  await runGit(["add", "-A"], { cwd: repoPath });
  await runGit(["commit", "-m", message], { cwd: repoPath });
  const sha = await runGit(["rev-parse", "HEAD"], { cwd: repoPath });
  return sha.stdout.trim();
}

async function writeHead(repoPath: string): Promise<string> {
  const sha = await runGit(["rev-parse", "HEAD"], { cwd: repoPath });
  return sha.stdout.trim();
}

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("diffing against a commit sha", () => {
  it("reports the commits, files, and patches committed after that sha", async () => {
    const repoPath = await initRepo();
    await write(repoPath, "src/app.ts", "const a = 1;\n");
    const startSha = await commitAll(repoPath, "start");
    await write(repoPath, "src/app.ts", "const a = 1;\nconst b = 2;\n");
    await write(repoPath, "src/added.ts", "export const added = true;\n");
    await commitAll(repoPath, "agent commits without asking");
    await write(repoPath, "src/uncommitted.ts", "export const pending = 1;\n");
    await write(repoPath, "src/untracked.ts", "export const untracked = 1;\n");
    const workspace = new Workspace(repoPath);

    const status = await workspace.getStatus({ mergeBaseBranch: startSha });
    expect(status.mergeBase?.baseRef).toBe(startSha);
    expect(status.mergeBase?.commits.map((commit) => commit.subject)).toEqual([
      "agent commits without asking",
    ]);
    expect(status.mergeBase?.files.map((file) => file.path).sort()).toEqual([
      "src/added.ts",
      "src/app.ts",
    ]);

    const target: WorkspaceDiffTarget = {
      mergeBaseBranch: startSha,
      type: "all",
    };
    const diffFiles = await workspace.diffFiles({ maxFiles: 100, target });
    expect(diffFiles.files.map((file) => file.path).sort()).toEqual([
      "src/added.ts",
      "src/app.ts",
      "src/uncommitted.ts",
      "src/untracked.ts",
    ]);
    expect(diffFiles.mergeBaseRef).toBe(startSha);

    const patches = await workspace.diffPatch({
      maxBytesPerFile: 100_000,
      paths: ["src/app.ts"],
      target,
    });
    expect(patches).toHaveLength(1);
    expect(patches[0]?.patch).toContain("+const b = 2;");
  });

  it("treats a sha that is already HEAD as an empty range without failing", async () => {
    const repoPath = await initRepo();
    await write(repoPath, "src/app.ts", "const a = 1;\n");
    const startSha = await commitAll(repoPath, "only commit");
    const workspace = new Workspace(repoPath);

    const status = await workspace.getStatus({ mergeBaseBranch: startSha });
    expect(status.mergeBase?.baseRef).toBe(startSha);
    expect(status.mergeBase?.commits).toEqual([]);

    const diffFiles = await workspace.diffFiles({
      maxFiles: 100,
      target: { mergeBaseBranch: startSha, type: "all" },
    });
    expect(diffFiles.files).toEqual([]);
    expect(await writeHead(repoPath)).toBe(startSha);
  });
});
