// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { makeEnvironment } from "@bb/test-helpers/domain-fixtures";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sdk } from "@/lib/sdk";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import { environmentQueryKey } from "../queries/query-keys";
import { useUpdateEnvironment } from "./environment-mutations";

vi.mock("@/lib/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sdk")>();
  return {
    ...actual,
    sdk: {
      ...actual.sdk,
      environments: { ...actual.sdk.environments, update: vi.fn() },
    },
  };
});

interface Harness {
  queryClient: ReturnType<typeof createQueryClientTestHarness>["queryClient"];
  wrapper: ReturnType<typeof createQueryClientTestHarness>["wrapper"];
}

function setup(): Harness {
  const { queryClient, wrapper } = createQueryClientTestHarness();
  return { queryClient, wrapper };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useUpdateEnvironment", () => {
  it("sends a pinned start commit and seeds it into the environment cache", async () => {
    const { queryClient, wrapper } = setup();
    const updated = makeEnvironment({ id: "env_1", startRef: "abc1234" });
    vi.mocked(sdk.environments.update).mockResolvedValue(updated);
    const { result } = renderHook(() => useUpdateEnvironment(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "env_1", startRef: "abc1234" });
    });

    expect(sdk.environments.update).toHaveBeenCalledWith({
      environmentId: "env_1",
      startRef: "abc1234",
    });
    expect(queryClient.getQueryData(environmentQueryKey("env_1"))).toEqual(
      updated,
    );
  });

  it("clears the pinned start commit", async () => {
    const { wrapper } = setup();
    vi.mocked(sdk.environments.update).mockResolvedValue(
      makeEnvironment({ id: "env_1", startRef: null }),
    );
    const { result } = renderHook(() => useUpdateEnvironment(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "env_1", startRef: null });
    });

    expect(sdk.environments.update).toHaveBeenCalledWith({
      environmentId: "env_1",
      startRef: null,
    });
  });

  it("still forwards merge-base and name updates", async () => {
    const { wrapper } = setup();
    vi.mocked(sdk.environments.update).mockResolvedValue(
      makeEnvironment({ id: "env_1", mergeBaseBranch: "release" }),
    );
    const { result } = renderHook(() => useUpdateEnvironment(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: "env_1",
        mergeBaseBranch: "release",
        name: null,
      });
    });

    expect(sdk.environments.update).toHaveBeenCalledWith({
      environmentId: "env_1",
      mergeBaseBranch: "release",
      name: null,
    });
  });

  it("rejects an update that names no field", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useUpdateEnvironment(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ id: "env_1" })).rejects.toThrow(
        "Environment update requires at least one field",
      );
    });

    expect(sdk.environments.update).not.toHaveBeenCalled();
  });
});
