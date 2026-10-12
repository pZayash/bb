// bb-fork(windows): enumerate project skills through host.list_skills instead
// of host.list_files. list_skills scans a symlinked <workspace>/.bb/skills
// root and marks matches linked, while list_files rejects a symlink root with
// invalid_path and fails the whole turn. An invalid_path response still
// degrades to an empty list, mirroring the local scan in injected-skills.ts.
import {
  EMPTY_PROVIDER_NATIVE_ROOTS,
  EMPTY_PROVIDER_RESOLVED_NATIVE_ROOTS,
} from "@bb/domain";
import type { DiscoveredSkill } from "@bb/host-daemon-contract";
import { COMMAND_TIMEOUT_MS } from "../../constants.js";
import { ApiError } from "../../errors.js";
import type { LoggedWorkSessionDeps } from "../../types.js";
import { callHostRetryableOnlineRpc } from "../hosts/online-rpc.js";
import type { ProjectInjectedSkillSource } from "./injected-skills.js";
import { hostPathDirname } from "./shared-skills.js";

export async function resolveWorkspaceProjectSkillSources(
  deps: LoggedWorkSessionDeps,
  args: { hostId: string; workspacePath: string },
): Promise<ProjectInjectedSkillSource[]> {
  const skills = await listWorkspaceProjectSkills(deps, args);
  let linkedCount = 0;
  const sources: ProjectInjectedSkillSource[] = [];
  for (const skill of skills) {
    if (skill.description === null) {
      deps.logger.warn(
        {
          filePath: skill.filePath,
          name: skill.name,
          reason: "Project skill description is missing",
          sourceType: "project",
        },
        "Skipping invalid injected skill",
      );
      continue;
    }
    if (skill.linked) linkedCount += 1;
    sources.push({
      kind: "workspace-path",
      sourceType: "project",
      name: skill.name,
      description: skill.description,
      sourceRootPath: hostPathDirname(skill.filePath),
      skillFilePath: skill.filePath,
    });
  }
  if (linkedCount > 0) {
    deps.logger.warn(
      { workspacePath: args.workspacePath, linkedCount },
      "Project skills discovered through a symlinked skills root",
    );
  }
  return sources.sort((left, right) => left.name.localeCompare(right.name));
}

export async function listWorkspaceProjectSkills(
  deps: LoggedWorkSessionDeps,
  args: { hostId: string; workspacePath: string },
): Promise<DiscoveredSkill[]> {
  try {
    const result = await callHostRetryableOnlineRpc(deps, {
      hostId: args.hostId,
      timeoutMs: COMMAND_TIMEOUT_MS,
      command: {
        type: "host.list_skills",
        providerId: "bb-shared",
        cwd: args.workspacePath,
        nativeRoots: {
          skills: EMPTY_PROVIDER_NATIVE_ROOTS,
          commands: EMPTY_PROVIDER_NATIVE_ROOTS,
          resolved: EMPTY_PROVIDER_RESOLVED_NATIVE_ROOTS,
        },
      },
    });
    return result.skills.filter((skill) => skill.rootKind === "bb-project");
  } catch (error) {
    if (error instanceof ApiError && error.body.code === "invalid_path") {
      deps.logger.warn(
        { workspacePath: args.workspacePath },
        "Skipping invalid project skills root",
      );
      return [];
    }
    throw error;
  }
}
