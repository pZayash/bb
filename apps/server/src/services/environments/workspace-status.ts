import {
  recordEnvironmentCurrentBranch,
  recordEnvironmentStartRefOnce,
} from "@bb/db/internal-environment-lifecycle";
import type { Environment } from "@bb/domain";
import type { HostDaemonOnlineRpcResult } from "@bb/host-daemon-contract";
import {
  COMMAND_TIMEOUT_MS,
  WORKSPACE_STATUS_MAX_UNTRACKED_LINE_STAT_BYTES,
  WORKSPACE_STATUS_MAX_UNTRACKED_LINE_STAT_FILES,
} from "../../constants.js";
import type { AppDeps } from "../../types.js";
import {
  callHostRetryableOnlineRpc,
  callHostRetryableOnlineRpcForWork,
} from "../hosts/online-rpc.js";
import type { WorkspaceCommandTarget } from "./workspace-command-target.js";

type WorkspaceStatusResult = HostDaemonOnlineRpcResult<"workspace.status">;

// bb-fork(thread-start-ref): enough history to pick a start commit by hand.
const WORKSPACE_COMMITS_MAX_COUNT = 50;

interface CallEnvironmentWorkspaceStatusArgs {
  environment: Pick<Environment, "id">;
  target: WorkspaceCommandTarget;
  mergeBaseBranch?: string;
}

function normalizeObservedDefaultBranch(defaultBranch: string): string | null {
  return defaultBranch.length > 0 ? defaultBranch : null;
}

export async function callEnvironmentWorkspaceStatus(
  deps: AppDeps,
  args: CallEnvironmentWorkspaceStatusArgs,
): Promise<WorkspaceStatusResult> {
  return callEnvironmentWorkspaceStatusWith(
    deps,
    args,
    callHostRetryableOnlineRpc,
  );
}

// bb-fork(thread-start-ref): recent commits for the start-commit picker.
export async function callEnvironmentCommits(
  deps: AppDeps,
  args: {
    environment: Pick<Environment, "id">;
    target: WorkspaceCommandTarget;
  },
): Promise<HostDaemonOnlineRpcResult<"workspace.commits">> {
  return callHostRetryableOnlineRpc(deps, {
    hostId: args.target.hostId,
    timeoutMs: COMMAND_TIMEOUT_MS,
    command: {
      type: "workspace.commits",
      environmentId: args.target.environmentId,
      workspaceContext: args.target.workspaceContext,
      maxCount: WORKSPACE_COMMITS_MAX_COUNT,
    },
  });
}

export async function callEnvironmentWorkspaceStatusForWork(
  deps: AppDeps,
  args: CallEnvironmentWorkspaceStatusArgs,
): Promise<WorkspaceStatusResult> {
  return callEnvironmentWorkspaceStatusWith(
    deps,
    args,
    callHostRetryableOnlineRpcForWork,
  );
}

async function callEnvironmentWorkspaceStatusWith(
  deps: AppDeps,
  args: CallEnvironmentWorkspaceStatusArgs,
  callRpc: typeof callHostRetryableOnlineRpc,
): Promise<WorkspaceStatusResult> {
  const result = await callRpc(deps, {
    hostId: args.target.hostId,
    timeoutMs: COMMAND_TIMEOUT_MS,
    command: {
      type: "workspace.status",
      environmentId: args.target.environmentId,
      workspaceContext: args.target.workspaceContext,
      maxUntrackedLineStatFiles: WORKSPACE_STATUS_MAX_UNTRACKED_LINE_STAT_FILES,
      maxUntrackedLineStatBytes: WORKSPACE_STATUS_MAX_UNTRACKED_LINE_STAT_BYTES,
      ...(args.mergeBaseBranch
        ? { mergeBaseBranch: args.mergeBaseBranch }
        : {}),
    },
  });

  if (result.outcome === "available") {
    recordEnvironmentCurrentBranch(deps.db, deps.hub, args.environment.id, {
      branchName: result.workspaceStatus.branch.currentBranch,
      defaultBranch: normalizeObservedDefaultBranch(
        result.workspaceStatus.branch.defaultBranch,
      ),
    });
    // bb-fork(thread-start-ref): the first workspace read pins the commit the thread
    // bb-fork(thread-start-ref): started from; later reads leave the record alone.
    const checkout = result.workspaceStatus.checkout;
    recordEnvironmentStartRefOnce(
      deps.db,
      deps.hub,
      args.environment.id,
      checkout.kind === "branch" || checkout.kind === "detached"
        ? checkout.headSha
        : null,
    );
  }

  return result;
}
