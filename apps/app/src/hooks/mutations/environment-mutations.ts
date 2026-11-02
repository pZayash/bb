import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Environment } from "@bb/domain";
import type { UpdateEnvironmentRequest } from "@bb/server-contract";
import type { EnvironmentUpdateArgs } from "@bb/sdk/browser";
import { sdk } from "@/lib/sdk";
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

export function useUpdateEnvironment() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: {
      errorMessage: "Failed to update environment.",
      showErrorToast: false,
    },
    mutationFn: ({ id, ...request }: UpdateEnvironmentMutationRequest) => {
      // bb-fork(thread-start-ref): the request is validated to name a field below.
      const args = { environmentId: id } as EnvironmentUpdateArgs;
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
