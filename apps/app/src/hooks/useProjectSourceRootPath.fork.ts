// bb-fork(file-links): project checkout root for relative file refs outside worktrees.
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
  areHostPathsEqual,
  PERSONAL_PROJECT_ID,
  type LocalPathProjectSource,
} from "@bb/domain";
import type { SidebarBootstrapResponse } from "@bb/server-contract";
import { sidebarNavigationThreadSelectionQueryOptions } from "@/hooks/queries/sidebar-navigation-query";

export function useProjectSourceRootPath(
  projectId: string | undefined,
  hostId: string | null,
): string | null {
  const select = useCallback(
    (navigation: SidebarBootstrapResponse) => {
      const project =
        projectId === PERSONAL_PROJECT_ID
          ? navigation.personalProject
          : navigation.projects.find((entry) => entry.id === projectId);
      const sources = (project?.sources ?? []).filter(
        (source): source is LocalPathProjectSource =>
          source.type === "local_path" && source.hostId === hostId,
      );
      return (
        (sources.find((source) => source.isDefault) ?? sources[0])?.path ?? null
      );
    },
    [hostId, projectId],
  );
  const query = useQuery({
    ...sidebarNavigationThreadSelectionQueryOptions(select),
    enabled: projectId !== undefined && hostId !== null,
  });
  return query.data ?? null;
}

export function useFileLinkFallbackRoots({
  projectId,
  hostId,
  workspaceRootPath,
  extraRoots,
}: {
  projectId: string | undefined;
  hostId: string | null;
  workspaceRootPath: string | null | undefined;
  extraRoots?: readonly string[];
}): readonly string[] {
  const projectSourceRootPath = useProjectSourceRootPath(projectId, hostId);
  return useMemo(() => {
    const roots: string[] = [];
    for (const root of [
      ...(extraRoots ?? []),
      ...(projectSourceRootPath === null ? [] : [projectSourceRootPath]),
    ]) {
      if (
        (workspaceRootPath == null ||
          !areHostPathsEqual(root, workspaceRootPath)) &&
        roots.every((existing) => !areHostPathsEqual(existing, root))
      ) {
        roots.push(root);
      }
    }
    return roots;
  }, [extraRoots, projectSourceRootPath, workspaceRootPath]);
}
