import {
  operationResponseSchema,
  type OperationResponse,
} from "@bb/server-contract";
import { createPluginsArea } from "./plugins.js";
import { createRetiredEnvironmentMembers } from "./retired-environment-members.js";
import {
  environmentSchema,
  type Environment,
  type EnvironmentStatus,
} from "@bb/domain";
import {
  commitActionResponseSchema,
  updateEnvironmentRequestSchema,
  type CommitActionResponse,
  // bb-fork(thread-start-ref): recent commits for the start-commit picker.
  type EnvironmentCommitsResponse,
  type EnvironmentArchiveThreadsResponse,
  type EnvironmentPathsQuery,
  type UpdateEnvironmentRequest,
  type WorkspacePathListResponse,
  type SystemEnvironmentProvider,
} from "@bb/server-contract";
import { signalRequestArgs, type CreateSdkAreaArgs } from "./common.js";

export interface EnvironmentActionArgs {
  environmentId: string;
}

export interface EnvironmentGetArgs extends EnvironmentActionArgs {
  signal?: AbortSignal;
}

type EnvironmentMergeBaseBranchUpdateValue = Exclude<
  UpdateEnvironmentRequest["mergeBaseBranch"],
  undefined
>;

type EnvironmentNameUpdateValue = Exclude<
  UpdateEnvironmentRequest["name"],
  undefined
>;

interface EnvironmentMergeBaseBranchUpdate {
  mergeBaseBranch: EnvironmentMergeBaseBranchUpdateValue;
  name?: EnvironmentNameUpdateValue;
  // bb-fork(thread-start-ref): pin the commit a thread compares from.
  startRef?: EnvironmentStartRefUpdateValue;
}

interface EnvironmentNameUpdate {
  mergeBaseBranch?: EnvironmentMergeBaseBranchUpdateValue;
  name: EnvironmentNameUpdateValue;
  // bb-fork(thread-start-ref): pin the commit a thread compares from.
  startRef?: EnvironmentStartRefUpdateValue;
}

type EnvironmentUpdateFields =
  | EnvironmentMergeBaseBranchUpdate
  | EnvironmentNameUpdate;

export type EnvironmentUpdateArgs = EnvironmentUpdateFields & {
  environmentId: string;
};

// bb-fork(thread-start-ref): recent commits for the start-commit picker.
export interface EnvironmentCommitsArgs {
  environmentId: string;
  signal?: AbortSignal;
}
export type EnvironmentCommitsResult = EnvironmentCommitsResponse;

export interface EnvironmentCommitArgs {
  environmentId: string;
}

export interface EnvironmentPathsArgs extends EnvironmentPathsQuery {
  environmentId: string;
  signal?: AbortSignal;
}

export type EnvironmentArchiveThreadsResult = EnvironmentArchiveThreadsResponse;
export type EnvironmentCommitResult = CommitActionResponse;
export type EnvironmentGetResult = Environment;
export type EnvironmentPathsResult = WorkspacePathListResponse;
export type EnvironmentUpdateResult = Environment;
export interface EnvironmentListArgs {
  environmentProviderId?: string;
  hostId?: string;
  instanceKey?: string;
  limit?: number;
  offset?: number;
  path?: string;
  projectId?: string;
  signal?: AbortSignal;
  status?: EnvironmentStatus;
}
export type EnvironmentListResult = Environment[];
export interface EnvironmentDeleteArgs {
  environmentId: string;
}
export type EnvironmentDeleteResult = OperationResponse;
export interface EnvironmentListProvidersArgs {
  projectId?: string;
  hostId?: string;
  signal?: AbortSignal;
}
export type EnvironmentListProvidersResult = SystemEnvironmentProvider[];

export interface EnvironmentsArea {
  experimental_cleanup(
    args: EnvironmentActionArgs & { recover?: boolean },
  ): Promise<OperationResponse>;
  archiveThreads(
    args: EnvironmentActionArgs,
  ): Promise<EnvironmentArchiveThreadsResult>;
  commit(args: EnvironmentCommitArgs): Promise<EnvironmentCommitResult>;
  // bb-fork(thread-start-ref): recent commits for the start-commit picker.
  commits(args: EnvironmentCommitsArgs): Promise<EnvironmentCommitsResult>;
  get(args: EnvironmentGetArgs): Promise<EnvironmentGetResult>;
  list(args?: EnvironmentListArgs): Promise<EnvironmentListResult>;
  listProviders(
    args?: EnvironmentListProvidersArgs,
  ): Promise<EnvironmentListProvidersResult>;
  delete(args: EnvironmentDeleteArgs): Promise<EnvironmentDeleteResult>;
  paths(args: EnvironmentPathsArgs): Promise<EnvironmentPathsResult>;
  update(args: EnvironmentUpdateArgs): Promise<EnvironmentUpdateResult>;
}

// bb-fork(thread-start-ref): pin the commit a thread compares from.
type EnvironmentStartRefUpdateValue = Exclude<
  UpdateEnvironmentRequest["startRef"],
  undefined
>;

function environmentUpdateJson(
  args: EnvironmentUpdateArgs,
): UpdateEnvironmentRequest {
  const request: UpdateEnvironmentRequest = {};
  if (args.mergeBaseBranch !== undefined) {
    request.mergeBaseBranch = args.mergeBaseBranch;
  }
  if (args.name !== undefined) {
    request.name = args.name;
  }
  // bb-fork(thread-start-ref): pin the commit a thread compares from.
  if (args.startRef !== undefined) {
    request.startRef = args.startRef;
  }
  return updateEnvironmentRequestSchema.parse(request);
}

function environmentPathsQuery(
  args: EnvironmentPathsArgs,
): EnvironmentPathsQuery {
  return {
    includeDirectories: args.includeDirectories,
    includeFiles: args.includeFiles,
    limit: args.limit,
    query: args.query,
  };
}

export function createEnvironmentsArea(
  args: CreateSdkAreaArgs,
): EnvironmentsArea {
  const { transport } = args;
  const area: EnvironmentsArea = {
    async archiveThreads(input) {
      return transport.readJson(
        transport.api.v1.environments[":id"]["archive-threads"].$post({
          param: { id: input.environmentId },
        }),
      );
    },
    async commit(input) {
      const body = await transport.readJson(
        transport.api.v1.environments[":id"].actions.$post({
          param: { id: input.environmentId },
          json: {
            action: "commit",
          },
        }),
      );
      return commitActionResponseSchema.parse(body);
    },
    async list(input) {
      return transport.readJson(
        transport.api.v1.environments.$get(
          {
            query: {
              ...(input?.projectId === undefined
                ? {}
                : { projectId: input.projectId }),
              ...(input?.hostId === undefined ? {} : { hostId: input.hostId }),
              ...(input?.environmentProviderId === undefined
                ? {}
                : { environmentProviderId: input.environmentProviderId }),
              ...(input?.instanceKey === undefined
                ? {}
                : { instanceKey: input.instanceKey }),
              ...(input?.status === undefined ? {} : { status: input.status }),
              ...(input?.path === undefined ? {} : { path: input.path }),
              ...(input?.limit === undefined
                ? {}
                : { limit: String(input.limit) }),
              ...(input?.offset === undefined
                ? {}
                : { offset: String(input.offset) }),
            },
          },
          ...signalRequestArgs(input?.signal),
        ),
      );
    },
    async listProviders(input) {
      const response = await transport.readJson(
        transport.api.v1.system["environment-providers"].$get(
          {
            query: {
              ...(input?.projectId === undefined
                ? {}
                : { projectId: input.projectId }),
              ...(input?.hostId === undefined ? {} : { hostId: input.hostId }),
            },
          },
          ...signalRequestArgs(input?.signal),
        ),
      );
      return response.providers;
    },
    async experimental_cleanup(input) {
      return transport.readJson(
        transport.api.v1.environments[":id"]["cleanup"].$post({
          param: { id: input.environmentId },
          query: { recover: input.recover === true ? "true" : "false" },
        }),
      );
    },
    async delete(input) {
      const body = await transport.readJson(
        transport.api.v1.environments[":id"].$delete({
          param: { id: input.environmentId },
        }),
      );
      return operationResponseSchema.parse(body);
    },
    async get(input) {
      const body = await transport.readJson(
        transport.api.v1.environments[":id"].$get(
          {
            param: { id: input.environmentId },
          },
          ...signalRequestArgs(input.signal),
        ),
      );
      return environmentSchema.parse(body);
    },
    async paths(input) {
      return transport.readJson(
        transport.api.v1.environments[":id"].paths.$get(
          {
            param: { id: input.environmentId },
            query: environmentPathsQuery(input),
          },
          ...signalRequestArgs(input.signal),
        ),
      );
    },
    // bb-fork(thread-start-ref): recent commits for the start-commit picker.
    async commits(input) {
      return transport.readJson(
        transport.api.v1.environments[":id"].commits.$get(
          { param: { id: input.environmentId } },
          ...signalRequestArgs(input.signal),
        ),
      );
    },
    async update(input) {
      return transport.readJson(
        transport.api.v1.environments[":id"].$patch({
          param: { id: input.environmentId },
          json: environmentUpdateJson(input),
        }),
      );
    },
  };
  return Object.assign(
    area,
    createRetiredEnvironmentMembers(createPluginsArea(args).callRpc),
  );
}
