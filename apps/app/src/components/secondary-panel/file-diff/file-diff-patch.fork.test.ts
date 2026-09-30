import { describe, expect, it } from "vitest";
import type { EnvironmentDiffPatchResponse } from "@bb/server-contract";
import { resolveFileDiffPatchState } from "./file-diff-patch.fork";

const MODIFIED_PATCH = [
  "diff --git a/src/file.ts b/src/file.ts",
  "index 1111111..2222222 100644",
  "--- a/src/file.ts",
  "+++ b/src/file.ts",
  "@@ -1,3 +1,3 @@",
  " const a = 1;",
  "-const b = 2;",
  "+const b = 3;",
  " const c = 4;",
  "",
].join("\n");

function available(
  patches: { path: string; patch: string; truncated: boolean }[],
): EnvironmentDiffPatchResponse {
  return { outcome: "available", patches };
}

describe("resolveFileDiffPatchState", () => {
  it("keeps the truncated flag and parses the hunks for the requested path", () => {
    const state = resolveFileDiffPatchState(
      available([
        { path: "src/file.ts", patch: MODIFIED_PATCH, truncated: true },
      ]),
      "src/file.ts",
    );

    expect(state.status).toBe("ready");
    if (state.status !== "ready") return;
    expect(state.truncated).toBe(true);
    expect(state.patchText).toContain("diff --git a/src/file.ts");
    expect(state.fileDiff.hunks).toHaveLength(1);
  });

  it("falls back to the only returned patch when the path does not match", () => {
    const state = resolveFileDiffPatchState(
      available([
        { path: "src/old.ts", patch: MODIFIED_PATCH, truncated: false },
      ]),
      "src/file.ts",
    );

    expect(state.status).toBe("ready");
  });

  it("reports a binary-only patch as unavailable instead of rendering it", () => {
    const state = resolveFileDiffPatchState(
      available([
        {
          path: "assets/logo.png",
          patch:
            "Binary files a/assets/logo.png and b/assets/logo.png differ\n",
          truncated: false,
        },
      ]),
      "assets/logo.png",
    );

    expect(state).toEqual({
      status: "unavailable",
      message: "This file has no text changes to show.",
    });
  });

  it("explains an empty patch list", () => {
    expect(resolveFileDiffPatchState(available([]), "src/file.ts")).toEqual({
      status: "unavailable",
      message: "No changes to show for this file.",
    });
  });

  it("surfaces the workspace message when the environment cannot diff", () => {
    expect(
      resolveFileDiffPatchState(
        {
          outcome: "not_applicable",
          reason: "non_git_environment",
          message: "This workspace is not a Git repository.",
        },
        "src/file.ts",
      ),
    ).toEqual({
      status: "unavailable",
      message: "This workspace is not a Git repository.",
    });
  });

  it("surfaces the resolution failure message", () => {
    expect(
      resolveFileDiffPatchState(
        {
          outcome: "unavailable",
          failure: {
            code: "path_not_found",
            message: "The workspace is gone.",
            workspacePath: "/repo",
          },
        },
        "src/file.ts",
      ),
    ).toEqual({ status: "unavailable", message: "The workspace is gone." });
  });
});
