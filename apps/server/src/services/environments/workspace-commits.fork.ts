// bb-fork(thread-start-ref): recent commits for the start-commit picker.
import type { Environment } from "@bb/domain";
import type { HostDaemonOnlineRpcResult } from "@bb/host-daemon-contract";
import type { AppDeps } from "../../types.js";
import { COMMAND_TIMEOUT_MS } from "../../constants.js";
import { callHostRetryableOnlineRpc } from "../hosts/online-rpc.js";
import type { WorkspaceCommandTarget } from "./workspace-command-target.js";

const WORKSPACE_COMMITS_MAX_COUNT = 50;

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
