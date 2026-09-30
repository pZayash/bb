// @vitest-environment jsdom
// bb-fork(file-diff): guards the file-tab diff against the patch-entry cache key.
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { Environment } from "@bb/domain";
import type { DiffPatchEntry } from "@bb/server-contract";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as environmentQueries from "@/hooks/queries/environment-queries";
import { environmentDiffPatchQueryKey } from "@/hooks/queries/query-keys";
import { sdk } from "@/lib/sdk";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import { useFileDiff } from "./useFileDiff.fork";

const ENVIRONMENT_ID = "env-1";
const TARGET_KEY = "main";
const PATH = "src/file.ts";

const PATCH = [
  "diff --git a/src/file.ts b/src/file.ts",
  "--- a/src/file.ts",
  "+++ b/src/file.ts",
  "@@ -1,2 +1,2 @@",
  " const a = 1;",
  "-const b = 2;",
  "+const b = 3;",
  "",
].join("\n");

vi.mock("@/lib/sdk", () => ({
  sdk: { environments: { diffPatch: vi.fn() } },
}));

vi.mock("@/hooks/queries/environment-queries", () => ({
  useEnvironment: vi.fn(),
  useEnvironmentWorkStatus: vi.fn(() => ({ data: undefined })),
}));

vi.mock("../git-diff/useDiffFileContentsRequester", () => ({
  useDiffFileContentsRequester: vi.fn(() => undefined),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useFileDiff", () => {
  it("ignores patch entries cached by the diff panel and loads its own response", async () => {
    const { wrapper, queryClient } = createQueryClientTestHarness();
    vi.mocked(environmentQueries.useEnvironment).mockReturnValue({
      data: {
        isGitRepo: true,
        mergeBaseBranch: TARGET_KEY,
      } as Environment,
      isError: false,
    } as never);
    vi.mocked(sdk.environments.diffPatch).mockResolvedValue({
      outcome: "available",
      patches: [{ path: PATH, patch: PATCH, truncated: false }],
    });

    const cachedEntry: DiffPatchEntry = {
      path: PATH,
      patch: "stale panel patch",
      truncated: false,
    };
    queryClient.setQueryData(
      environmentDiffPatchQueryKey(ENVIRONMENT_ID, "all", TARGET_KEY, PATH),
      cachedEntry,
    );

    const { result } = renderHook(
      () =>
        useFileDiff({
          enabled: true,
          environmentId: ENVIRONMENT_ID,
          path: PATH,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.bodyState.status).toBe("ready");
    });
    expect(sdk.environments.diffPatch).toHaveBeenCalled();
    if (result.current.bodyState.status !== "ready") return;
    expect(result.current.bodyState.patchText).toBe(PATCH);
  });
});
