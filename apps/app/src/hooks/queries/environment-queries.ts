import { queryOptions, useQuery } from "@tanstack/react-query";
import type { Environment } from "@bb/domain";
import type { WorkspacePathListResponse } from "@bb/server-contract";
import type {
  EnvironmentCommitsResult,
} from "@bb/sdk/browser";
import {
  type EnvironmentFilePreviewSource,
  type FilePreview,
} from "@bb/client-core";
import { loadFilePreview } from "@/lib/api";
import { buildEnvironmentFileContentUrl } from "@/lib/file-content-urls";
import { sdk } from "@/lib/sdk";
import { useEnvironmentDetailRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { keepNewerByUpdatedAt } from "@/hooks/cache-owners/cache-effect-utils";
import {
  environmentCommitsQueryKey,
  environmentFilePreviewQueryKey,
  environmentPathsQueryKey,
  environmentQueryKey,
} from "./query-keys";
import { requireEnabledQueryArg, type QueryOptions } from "./query-helpers";
import {
  EXPENSIVE_MANUAL_QUERY_POLICY,
  REALTIME_OWNED_NO_FOCUS_QUERY_POLICY,
  HEAVY_PAYLOAD_QUERY_POLICY,
  TYPEAHEAD_QUERY_POLICY,
} from "./query-policies";

interface EnvironmentQueryOptions extends QueryOptions {
  staleTime?: number;
}

function requireEnvironmentId(
  environmentId: string | null | undefined,
  hookName: string,
): string {
  return requireEnabledQueryArg({
    value: environmentId,
    hookName,
    argName: "environmentId",
  });
}

export function useEnvironment(
  environmentId: string | null | undefined,
  options?: EnvironmentQueryOptions,
) {
  const enabled = (options?.enabled ?? true) && Boolean(environmentId);
  useEnvironmentDetailRealtimeSubscription(environmentId, { enabled });

  return useQuery({
    ...environmentQueryOptions(environmentId),
    enabled,
    staleTime: options?.staleTime,
  });
}

export function environmentQueryOptions(
  environmentId: string | null | undefined,
) {
  return queryOptions<Environment>({
    queryKey: environmentQueryKey(environmentId),
    queryFn: async ({ client, queryKey, signal }) => {
      const environment = await sdk.environments.get({
        environmentId: requireEnvironmentId(environmentId, "useEnvironment"),
        signal,
      });
      return keepNewerByUpdatedAt(
        client.getQueryData<Environment>(queryKey),
        environment,
      );
    },
  });
}

// bb-fork(thread-start-ref): recent commits for the start-commit picker.
export function useEnvironmentCommits(
  environmentId: string | null | undefined,
  options?: QueryOptions,
) {
  const enabled = (options?.enabled ?? true) && Boolean(environmentId);
  useEnvironmentDetailRealtimeSubscription(environmentId, { enabled });

  return useQuery<EnvironmentCommitsResult>({
    queryKey: environmentCommitsQueryKey(environmentId),
    queryFn: ({ signal }) =>
      sdk.environments.commits({
        environmentId: requireEnvironmentId(
          environmentId,
          "useEnvironmentCommits",
        ),
        signal,
      }),
    enabled,
    ...REALTIME_OWNED_NO_FOCUS_QUERY_POLICY,
    staleTime: 5_000,
  });
}

export function useEnvironmentFilePreview(
  environmentId: string | null | undefined,
  path: string | null,
  source: EnvironmentFilePreviewSource | null,
  options?: QueryOptions,
) {
  const enabled =
    (options?.enabled ?? true) &&
    Boolean(environmentId) &&
    Boolean(path) &&
    source !== null;
  useEnvironmentDetailRealtimeSubscription(environmentId, { enabled });

  return useQuery<FilePreview>({
    queryKey: environmentFilePreviewQueryKey(environmentId, path, source),
    queryFn: async ({ signal }) => {
      const resolvedPath = requireEnabledQueryArg({
        value: path,
        hookName: "useEnvironmentFilePreview",
        argName: "path",
      });
      const resolvedSource = requireEnabledQueryArg({
        value: source,
        hookName: "useEnvironmentFilePreview",
        argName: "source",
      });
      const resolvedEnvironmentId = requireEnvironmentId(
        environmentId,
        "useEnvironmentFilePreview",
      );
      return loadFilePreview(
        {
          name: resolvedPath.split("/").at(-1),
          path: resolvedPath,
          url: buildEnvironmentFileContentUrl(
            resolvedEnvironmentId,
            resolvedSource,
            resolvedPath,
          ),
        },
        signal,
      );
    },
    enabled,
    ...EXPENSIVE_MANUAL_QUERY_POLICY,
    ...HEAVY_PAYLOAD_QUERY_POLICY,
  });
}

interface UseEnvironmentPathSuggestionsArgs {
  environmentId: string | null | undefined;
  query: string | null;
  limit?: number;
  includeFiles: boolean;
  includeDirectories: boolean;
}

export function useEnvironmentPathSuggestions(
  args: UseEnvironmentPathSuggestionsArgs,
) {
  const {
    environmentId,
    query,
    limit = 8,
    includeFiles,
    includeDirectories,
  } = args;
  const trimmedQuery = query?.trim() ?? "";
  const enabled = Boolean(environmentId) && trimmedQuery.length > 0;
  useEnvironmentDetailRealtimeSubscription(environmentId, { enabled });

  return useQuery<WorkspacePathListResponse>({
    queryKey: environmentPathsQueryKey(
      environmentId ?? undefined,
      trimmedQuery,
      limit,
      includeFiles,
      includeDirectories,
    ),
    queryFn: ({ signal }) =>
      sdk.environments.paths({
        environmentId: requireEnvironmentId(
          environmentId,
          "useEnvironmentPathSuggestions",
        ),
        query: trimmedQuery,
        limit: String(limit),
        includeFiles: includeFiles ? "true" : "false",
        includeDirectories: includeDirectories ? "true" : "false",
        signal,
      }),
    enabled,
    ...TYPEAHEAD_QUERY_POLICY,
    placeholderData: (previousData) => previousData,
  });
}

