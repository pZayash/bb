import { describe, expect, it, vi } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "../server.js";

const workspaceSource = {
  kind: "workspace" as const,
  threadId: "thread-1",
  environmentId: "env-1",
  projectId: null,
};

const OLD_FILE_CONTENTS = "const b = 2;\n";
const NEW_FILE_CONTENTS = "const b = 3;\n";

const PATCH = [
  "diff --git a/src/file.ts b/src/file.ts",
  "--- a/src/file.ts",
  "+++ b/src/file.ts",
  "@@ -1,1 +1,1 @@",
  "-old",
  "+new",
  "",
].join("\n");

interface SetupOverrides {
  environment?: Record<string, unknown>;
  statusResponse?: unknown;
  patchResponse?: unknown;
  onDemandPatchResponse?: unknown;
}

async function setup(overrides: SetupOverrides = {}) {
  const get = vi.fn(() => ({
    isGitRepo: true,
    mergeBaseBranch: "main",
    baseBranch: null,
    defaultBranch: "main",
    startRef: "abc1234567890",
    ...overrides.environment,
  }));
  const status = vi.fn((args: unknown) => {
    if (overrides.statusResponse !== undefined) {
      return overrides.statusResponse;
    }
    const mergeBaseBranch =
      typeof args === "object" && args !== null && "mergeBaseBranch" in args
        ? (args as { mergeBaseBranch?: unknown }).mergeBaseBranch
        : undefined;
    return {
      outcome: "available",
      workspace: {
        workingTree: { hasUncommittedChanges: true },
        mergeBase:
          typeof mergeBaseBranch === "string"
            ? {
                baseRef: mergeBaseBranch,
                commits: [
                  { sha: "1111111", shortSha: "1111111", subject: "First" },
                  { sha: "2222222", shortSha: "2222222", subject: "Second" },
                ],
              }
            : null,
      },
    };
  });
  const diffPatch = vi.fn(
    (_args?: unknown) =>
      overrides.patchResponse ?? {
        outcome: "available",
        files: [{ path: "src/file.ts", revision: "rev_1" }],
        truncated: false,
        initialPatches: [{ path: "src/file.ts", patch: PATCH, truncated: false }],
      },
  );
  const onDemandPatch = vi.fn((args?: unknown) => {
    if (overrides.onDemandPatchResponse !== undefined) {
      return overrides.onDemandPatchResponse;
    }
    const key = (args as { keys: string[] }).keys[0]!;
    return {
      [key]: {
        outcome: "available",
        patch: { path: "src/file.ts", patch: PATCH, truncated: false },
      },
    };
  });
  const diffFile = vi.fn((args: unknown) => {
    const side =
      typeof args === "object" && args !== null && "side" in args
        ? (args as { side?: unknown }).side
        : undefined;
    return {
      outcome: "available",
      file: {
        content: side === "old" ? OLD_FILE_CONTENTS : NEW_FILE_CONTENTS,
        contentEncoding: "utf8",
        mimeType: "text/plain",
        path: "src/file.ts",
        sizeBytes: 10,
      },
    };
  });
  const callRpc = vi.fn(
    async (...callArgs: unknown[]): Promise<unknown> => {
      const [args] = callArgs as [
        { method: string; input: Record<string, unknown> },
      ];
      switch (args.method) {
        case "workspaceStatus":
          return status(args.input);
        case "fileSide": {
          const query = args.input.query as Record<string, unknown>;
          return diffFile({
            ...query,
            environmentId: args.input.environmentId,
          });
        }
        case "files":
          return diffPatch(args.input);
        case "patches":
          return onDemandPatch(args.input);
        default:
          throw new Error(`unexpected git rpc ${args.method}`);
      }
    },
  );
  const commits = vi.fn(() => ({
    commits: [
      {
        sha: "3333333333333333333333333333333333333333",
        shortSha: "3333333",
        subject: "Earlier",
      },
    ],
    outcome: "available" as const,
  }));
  const { bb, harness } = createFakePluginHost({
    pluginId: "monaco-editor",
    sdk: { environments: { commits, get }, plugins: { callRpc } },
  });
  await plugin(bb);
  return {
    callRpc,
    commits,
    diffFile,
    diffPatch,
    get,
    harness,
    onDemandPatch,
    status,
  };
}

describe("file diff rpc", () => {
  it("returns the patch and the base options for the workspace default", async () => {
    const { diffFile, diffPatch, harness } = await setup();

    const result = await harness.callRpc("diff", {
      path: "src/file.ts",
      selection: null,
      source: workspaceSource,
    });

    expect(result).toEqual({
      contents: { new: NEW_FILE_CONTENTS, old: OLD_FILE_CONTENTS },
      outcome: "available",
      options: [
        { label: "All changes", value: "all" },
        { label: "Committed changes", value: "branch_committed" },
        { label: "Uncommitted changes", value: "uncommitted" },
        { label: "First", monoPrefix: "1111111", value: "1111111" },
        { label: "Second", monoPrefix: "2222222", value: "2222222" },
        { label: "Since thread start (abc1234)", value: "thread_start_ref" },
      ],
      patch: PATCH,
      patchPath: "src/file.ts",
      selection: "all",
      truncated: false,
    });
    expect(diffPatch).toHaveBeenCalledWith({
      environmentId: "env-1",
      ignoreWhitespace: false,
      target: { mergeBaseBranch: "main", type: "all" },
    });
    expect(diffFile).toHaveBeenCalledWith({
      environmentId: "env-1",
      mergeBaseRef: "main",
      path: "src/file.ts",
      side: "old",
      target: "all",
    });
  });

  it("maps a picked base onto the matching diff target", async () => {
    const { diffPatch, harness } = await setup();

    await harness.callRpc("diff", {
      path: "src/file.ts",
      selection: "uncommitted",
      source: workspaceSource,
    });
    expect(diffPatch).toHaveBeenLastCalledWith({
      environmentId: "env-1",
      ignoreWhitespace: false,
      target: { type: "uncommitted" },
    });

    await harness.callRpc("diff", {
      path: "src/file.ts",
      selection: "2222222",
      source: workspaceSource,
    });
    expect(diffPatch).toHaveBeenLastCalledWith({
      environmentId: "env-1",
      ignoreWhitespace: false,
      target: { sha: "2222222", type: "commit" },
    });
  });

  it("falls back to the default base when the selection is unknown", async () => {
    const { harness } = await setup();

    const result = await harness.callRpc("diff", {
      path: "src/file.ts",
      selection: "not-a-sha",
      source: workspaceSource,
    });

    expect(result).toMatchObject({ outcome: "available", selection: "all" });
  });

  it("offers only uncommitted changes when the environment has no base branch", async () => {
    const { diffPatch, harness } = await setup({
      environment: {
        mergeBaseBranch: null,
        baseBranch: null,
        defaultBranch: null,
      },
    });

    const result = await harness.callRpc("diff", {
      path: "src/file.ts",
      selection: null,
      source: workspaceSource,
    });

    expect(result).toMatchObject({
      outcome: "available",
      options: [
        { label: "Uncommitted changes", value: "uncommitted" },
        { label: "Since thread start (abc1234)", value: "thread_start_ref" },
      ],
      selection: "uncommitted",
    });
    expect(diffPatch).toHaveBeenCalledWith({
      environmentId: "env-1",
      ignoreWhitespace: false,
      target: { type: "uncommitted" },
    });
  });

  it("compares against the thread start commit when asked", async () => {
    const { diffFile, diffPatch, harness, status } = await setup();

    const result = await harness.callRpc("diff", {
      path: "src/file.ts",
      selection: "thread_start_ref",
      source: workspaceSource,
    });

    expect(status).toHaveBeenLastCalledWith({
      environmentId: "env-1",
      mergeBaseBranch: "abc1234567890",
    });
    expect(diffPatch).toHaveBeenLastCalledWith({
      environmentId: "env-1",
      ignoreWhitespace: false,
      target: { mergeBaseBranch: "abc1234567890", type: "all" },
    });
    expect(diffFile).toHaveBeenCalledWith({
      environmentId: "env-1",
      mergeBaseRef: "abc1234567890",
      path: "src/file.ts",
      side: "old",
      target: "all",
    });
    expect(result).toMatchObject({
      outcome: "available",
      options: [
        { label: "Changes since thread start (abc1234)", value: "all" },
        {
          label: "Committed since thread start (abc1234)",
          value: "branch_committed",
        },
        { label: "Uncommitted changes", value: "uncommitted" },
        { label: "First", monoPrefix: "1111111", value: "1111111" },
        { label: "Second", monoPrefix: "2222222", value: "2222222" },
        {
          label: "Compare with merge base (main)",
          value: "merge_base_ref",
        },
      ],
      selection: "thread_start_ref",
    });
  });

  it("returns to the merge base when the switch entry is picked", async () => {
    const { diffPatch, harness, status } = await setup();

    const result = await harness.callRpc("diff", {
      path: "src/file.ts",
      selection: "merge_base_ref",
      source: workspaceSource,
    });

    expect(status).toHaveBeenLastCalledWith({
      environmentId: "env-1",
      mergeBaseBranch: "main",
    });
    expect(diffPatch).toHaveBeenLastCalledWith({
      environmentId: "env-1",
      ignoreWhitespace: false,
      target: { mergeBaseBranch: "main", type: "all" },
    });
    expect(result).toMatchObject({ outcome: "available", selection: "all" });
  });

  it("keeps the thread-start option out when the workspace has none", async () => {
    const { harness } = await setup({ environment: { startRef: null } });

    const result = await harness.callRpc("diff", {
      path: "src/file.ts",
      selection: null,
      source: workspaceSource,
    });

    expect(result).toMatchObject({ outcome: "available", selection: "all" });
    expect(
      (result as { options: { value: string }[] }).options.map(
        (option) => option.value,
      ),
    ).not.toContain("thread_start_ref");
  });

  it("compares against a picked base commit", async () => {
    const { diffFile, diffPatch, harness, status } = await setup();
    const sha = "9999999999999999999999999999999999999999";

    const result = await harness.callRpc("diff", {
      path: "src/file.ts",
      selection: `since_commit:${sha}`,
      source: workspaceSource,
    });

    expect(status).toHaveBeenLastCalledWith({
      environmentId: "env-1",
      mergeBaseBranch: sha,
    });
    expect(diffPatch).toHaveBeenLastCalledWith({
      environmentId: "env-1",
      ignoreWhitespace: false,
      target: { mergeBaseBranch: sha, type: "all" },
    });
    expect(diffFile).toHaveBeenCalledWith({
      environmentId: "env-1",
      mergeBaseRef: sha,
      path: "src/file.ts",
      side: "old",
      target: "all",
    });
    expect(result).toMatchObject({
      outcome: "available",
      options: [
        { label: "Changes since 9999999", value: `since_commit:${sha}` },
        {
          label: "Committed since 9999999",
          value: `since_committed:${sha}`,
        },
        { label: "Uncommitted changes", value: "uncommitted" },
        { label: "First", monoPrefix: "1111111", value: "1111111" },
        { label: "Second", monoPrefix: "2222222", value: "2222222" },
        { label: "Since thread start (abc1234)", value: "thread_start_ref" },
        {
          label: "Compare with merge base (main)",
          value: "merge_base_ref",
        },
      ],
      selection: `since_commit:${sha}`,
    });
  });

  it("diffs the committed range only for a since_committed base", async () => {
    const { diffPatch, harness } = await setup();
    const sha = "9999999999999999999999999999999999999999";

    await harness.callRpc("diff", {
      path: "src/file.ts",
      selection: `since_committed:${sha}`,
      source: workspaceSource,
    });

    expect(diffPatch).toHaveBeenLastCalledWith({
      environmentId: "env-1",
      ignoreWhitespace: false,
      target: { mergeBaseBranch: sha, type: "branch_committed" },
    });
  });

  it("serves recent commits for the base picker", async () => {
    const { commits, harness } = await setup();

    const result = await harness.callRpc("commits", {
      source: workspaceSource,
    });

    expect(commits).toHaveBeenCalledWith({ environmentId: "env-1" });
    expect(result).toEqual({
      commits: [
        {
          sha: "3333333333333333333333333333333333333333",
          shortSha: "3333333",
          subject: "Earlier",
        },
      ],
      outcome: "available",
    });
  });

  it("reports commits as unavailable outside a workspace", async () => {
    const { commits, harness } = await setup();

    const result = await harness.callRpc("commits", {
      source: {
        kind: "host",
        threadId: null,
        environmentId: null,
        projectId: null,
      },
    });

    expect(commits).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcome: "unavailable",
      message: "This file is not in a Git workspace.",
    });
  });

  it("skips the side reads when contents are not requested", async () => {
    const { diffFile, harness } = await setup();

    const result = await harness.callRpc("diff", {
      includeContents: false,
      path: "src/file.ts",
      selection: null,
      source: workspaceSource,
    });

    expect(diffFile).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      contents: null,
      outcome: "available",
      patch: PATCH,
      patchPath: "src/file.ts",
    });
  });

  it("refuses files outside a git workspace without calling the sdk", async () => {
    const { get, harness, status } = await setup();

    const result = await harness.callRpc("diff", {
      path: "notes/file.md",
      selection: null,
      source: {
        kind: "thread-storage",
        threadId: "thread-1",
        environmentId: null,
        projectId: null,
      },
    });

    expect(result).toEqual({
      outcome: "unavailable",
      message: "This file is not in a Git workspace.",
    });
    expect(get).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it("refuses a workspace that is not a git repository", async () => {
    const { status, harness } = await setup({
      environment: { isGitRepo: false },
    });

    const result = await harness.callRpc("diff", {
      path: "src/file.ts",
      selection: null,
      source: workspaceSource,
    });

    expect(result).toEqual({
      outcome: "unavailable",
      message: "This workspace is not a Git repository.",
    });
    expect(status).not.toHaveBeenCalled();
  });

  it("explains a workspace whose git state cannot be read", async () => {
    const { harness } = await setup({
      statusResponse: {
        outcome: "unavailable",
        code: "path_not_found",
        message: "The workspace is gone.",
      },
    });

    expect(
      await harness.callRpc("diff", {
        path: "src/file.ts",
        selection: null,
        source: workspaceSource,
      }),
    ).toEqual({ outcome: "unavailable", message: "The workspace is gone." });
  });

  it("fetches the patch on demand when it is not inline", async () => {
    const { harness, onDemandPatch } = await setup({
      patchResponse: {
        outcome: "available",
        files: [{ path: "src/file.ts", revision: "rev_9" }],
        truncated: false,
        initialPatches: [],
      },
    });

    const result = await harness.callRpc("diff", {
      path: "src/file.ts",
      selection: null,
      source: workspaceSource,
    });

    expect(onDemandPatch).toHaveBeenCalledOnce();
    const keys = (onDemandPatch.mock.calls[0]![0] as { keys: string[] }).keys;
    const [environmentId, target, ignoreWhitespace, path, revision] =
      JSON.parse(keys[0]!) as [
        string,
        { type: string; mergeBaseBranch?: string },
        boolean,
        string,
        string,
      ];
    expect(environmentId).toBe("env-1");
    expect(target).toEqual({ type: "all", mergeBaseBranch: "main" });
    expect(ignoreWhitespace).toBe(false);
    expect(path).toBe("src/file.ts");
    expect(revision).toBe("rev_9");
    expect(result).toMatchObject({ outcome: "available", patch: PATCH });
  });

  it("explains a file with no changes in the chosen base", async () => {
    const { harness } = await setup({
      patchResponse: {
        outcome: "available",
        files: [],
        truncated: false,
        initialPatches: [],
      },
    });

    expect(
      await harness.callRpc("diff", {
        path: "src/file.ts",
        selection: null,
        source: workspaceSource,
      }),
    ).toEqual({
      outcome: "unavailable",
      message: "No changes to show for this file.",
    });
  });
});
