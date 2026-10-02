import {
  beginArchiveEnvironmentThreadsTransaction,
  rollbackArchiveThreadsTransaction,
  settleArchiveThreadsTransaction,
  type ArchiveThreadsTransaction,
} from "../cache-owners/thread-state-cache-owner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Environment } from "@bb/domain";
import type {
  EnvironmentArchiveThreadsResponse,
  EnvironmentActionResponse,
  UpdateEnvironmentRequest,
} from "@bb/server-contract";
import type { EnvironmentUpdateArgs } from "@bb/sdk/browser";
import { sdk } from "@/lib/sdk";
import type { RequestEnvironmentActionMutationRequest } from "./mutation-request-types";
import { invalidateEnvironmentActionQueries } from "../cache-owners/environment-cache-effects";
import {
  applyEnvironmentUpdateResult,
  beginEnvironmentNameUpdateTransaction,
  completeEnvironmentNameUpdateTransaction,
  rollbackEnvironmentNameUpdateTransaction,
  type EnvironmentNameUpdateTransaction,
} from "../cache-owners/environment-workspace-cache-owner";
type UpdateEnvironmentMutationRequest = {
  id: string;
} & UpdateEnvironmentRequest;

interface ArchiveEnvironmentThreadsMutationRequest {
  id: string;
}

export function useRequestEnvironmentAction() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: {
      errorMessage: "Failed to run environment action.",
      showErrorToast: false,
    },
    mutationFn: ({
      id,
      ...request
    }: RequestEnvironmentActionMutationRequest): Promise<EnvironmentActionResponse> => {
      switch (request.action) {
        case "commit":
          return sdk.environments.commit({ environmentId: id });
        case "pull_request_ready":
          return sdk.environments.markPullRequestReady({ environmentId: id });
        case "pull_request_merge":
          return sdk.environments.mergePullRequest({
            environmentId: id,
            method: request.options.method,
          });
        case "pull_request_draft":
          return sdk.environments.markPullRequestDraft({ environmentId: id });
      }
    },
    onSuccess: (_response, variables) => {
      invalidateEnvironmentActionQueries({
        environmentId: variables.id,
        queryClient,
      });
    },
  });
}

export function useArchiveEnvironmentThreads() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: {
      errorMessage: "Failed to archive threads.",
    },
    mutationFn: ({
      id,
    }: ArchiveEnvironmentThreadsMutationRequest): Promise<EnvironmentArchiveThreadsResponse> =>
      sdk.environments.archiveThreads({ environmentId: id }),
    onMutate: async ({ id }): Promise<ArchiveThreadsTransaction> =>
      beginArchiveEnvironmentThreadsTransaction({
        environmentId: id,
        queryClient,
      }),
    onError: (_error, _variables, context) => {
      rollbackArchiveThreadsTransaction({
        queryClient,
        transaction: context,
      });
    },
    onSettled: (data, _error, variables, context) => {
      invalidateEnvironmentActionQueries({
        environmentId: variables.id,
        queryClient,
      });
      settleArchiveThreadsTransaction({
        queryClient,
        response: data,
        transaction: context,
      });
    },
  });
}

export function useUpdateEnvironment() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: {
      errorMessage: "Failed to update environment.",
      showErrorToast: false,
    },
    mutationFn: ({ id, ...request }: UpdateEnvironmentMutationRequest) => {
      const args: EnvironmentUpdateArgs = { environmentId: id };
      if (request.mergeBaseBranch !== undefined) {
        args.mergeBaseBranch = request.mergeBaseBranch;
      }
      if (request.name !== undefined) {
        args.name = request.name;
      }
      // bb-fork(thread-start-ref): the chosen start commit reaches the panels.
      if (request.startRef !== undefined) {
        args.startRef = request.startRef;
      }
      if (Object.keys(args).length === 1) {
        throw new Error("Environment update requires at least one field");
      }
      return sdk.environments.update(args);
    },
    onMutate: ({
      id,
      name,
    }): Promise<EnvironmentNameUpdateTransaction> | undefined =>
      name === undefined
        ? undefined
        : beginEnvironmentNameUpdateTransaction({
            environmentId: id,
            name,
            queryClient,
          }),
    onError: (_error, _variables, transaction) => {
      rollbackEnvironmentNameUpdateTransaction({ queryClient, transaction });
    },
    onSuccess: (environment: Environment, variables, transaction) => {
      completeEnvironmentNameUpdateTransaction({
        environment,
        queryClient,
        transaction,
      });
      // bb-fork(thread-start-ref): seed the picked start commit at once.
      if (variables.startRef !== undefined) {
        applyEnvironmentUpdateResult({ environment, queryClient });
      }
    },
  });
}
