import type { LoggedWorkSessionDeps } from "../../types.js";
import type { ProjectInjectedSkillSource } from "./injected-skills.js";
// bb-fork(windows): the scan moved to host.list_skills so a symlinked
// <workspace>/.bb/skills root is followed instead of failing the turn.
import { resolveWorkspaceProjectSkillSources } from "./workspace-skills.fork.js";

interface ResolveWorkspaceProjectSkillsArgs {
  hostId: string;
  workspacePath: string;
}

export async function resolveWorkspaceProjectSkills(
  deps: LoggedWorkSessionDeps,
  args: ResolveWorkspaceProjectSkillsArgs,
): Promise<ProjectInjectedSkillSource[]> {
  return resolveWorkspaceProjectSkillSources(deps, args);
}
